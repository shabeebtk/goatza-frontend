/**
 * GET /card/profile/<username>?format=story|link&slots=height,attr:foot,city&qr=0
 *
 * The generated share card. One renderer produces both the 1080×1920 image a
 * player drops into an Instagram Story and the 1200×630 image a crawler picks
 * up from the profile page's OG tag.
 *
 * NOT under `/api/` — that prefix is rewritten wholesale to Django by
 * `vercel.json`, so a route handler there is dead in production while working
 * perfectly in `next dev`. See CARD_ROUTE in shareCard/cardUrl.ts.
 *
 * `nodejs`, not `edge`: three font files plus the layout sit uncomfortably
 * close to the edge bundle limit, and this route is cached hard enough that
 * cold-start latency does not matter.
 */

import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

import { getPublicUserProfile } from "@/features/profile/services/publicProfile.api"
import ProfileCard from "@/features/profile/utils/shareCard/ProfileCard"
import { toCardData } from "@/features/profile/utils/shareCard/cardData"
import { cardFonts } from "@/features/profile/utils/shareCard/fonts"
import {
  RETRY_AFTER_SECONDS,
  allowRender,
  clientKey,
} from "@/features/profile/utils/shareCard/rateLimit"
import { canonicalSlotKey } from "@/features/profile/utils/shareCard/slots"
import { CARD_SIZES, type CardFormat } from "@/features/profile/utils/shareCard/types"
import { profilePath } from "@/shared/services/profileUrl"

export const runtime = "nodejs"

/**
 * An hour fresh, a day stale-while-revalidate. A profile edit moves
 * `updated_at`, which moves the ETag, so a stale card is only ever served to
 * someone who would otherwise be waiting on a render.
 */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400"

function parseFormat(raw: string | null): CardFormat {
  // Defaults to `link` — the crawler is the caller that cannot pass a param,
  // and it is the one that must never get a 400.
  return raw === "story" ? "story" : "link"
}

/**
 * Where the QR points: the profile's own public URL, tagged as having been
 * reached from a card.
 *
 * `NEXT_PUBLIC_SITE_URL` first, the request's own origin second. The result
 * must be absolute — a camera has no origin to resolve a path against, so a
 * relative URL here is a QR that scans to nothing. `profilePath` rather than
 * `profileUrl`: the latter falls back to `window.location`, and there is no
 * window inside a render.
 *
 * `ref=card` is attribution only. Nothing consumes it yet; it is in the encoded
 * URL from the first scan so that when something does, the history is there.
 */
function qrTarget(username: string, requestUrl: string): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
  const origin = configured || new URL(requestUrl).origin

  return `${origin}${profilePath(username, "user")}?ref=card`
}

/**
 * Not found, and deliberately indistinguishable from a typo.
 *
 * A card is a public artifact. Rendering one for a profile whose owner turned
 * the public toggle off would leak, in an image that then travels through chat
 * apps, exactly what that toggle exists to prevent. The bundle endpoint already
 * collapses "hidden", "deactivated", "no username" and "no such user" into one
 * null, so all four land here.
 */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain",
      // Briefly cacheable: a crawler retrying a dead link should not cost a
      // backend round trip every time, but a profile that goes public should
      // start working within the minute.
      "Cache-Control": "public, max-age=60",
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const { searchParams } = new URL(request.url)

  const format = parseFormat(searchParams.get("format"))

  // Slots are a story-card affordance. The link preview always uses the fixed
  // default set: the crawler fetches it, not the player, so a card built from
  // somebody's picks would be a card nobody chose.
  const requestedSlots = format === "story" ? searchParams.get("slots") : null

  // On unless explicitly switched off, and never on the link card. Only the
  // exact string "0" turns it off — same philosophy as `parseFormat`: garbage
  // in a hand-edited query string gets the default, not a 400, because the
  // caller on the other end of a broken image is somebody's chat app.
  const qrOn = format === "story" && searchParams.get("qr") !== "0"

  if (!allowRender(clientKey(request.headers))) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Content-Type": "text/plain",
        "Retry-After": String(RETRY_AFTER_SECONDS),
      },
    })
  }

  const bundle = await getPublicUserProfile(username)
  if (!bundle || bundle.type !== "user" || !bundle.profile?.username) {
    return notFound()
  }

  const data = toCardData(
    bundle,
    format,
    requestedSlots,
    qrOn ? qrTarget(bundle.profile.username, request.url) : null
  )
  const { width, height } = CARD_SIZES[format]

  const response = new ImageResponse(<ProfileCard data={data} format={format} />, {
    width,
    height,
    fonts: await cardFonts(),
  })

  response.headers.set("Cache-Control", CACHE_CONTROL)

  // Cache identity: username + format + canonically-sorted slots + qr state +
  // updated_at.
  //
  // Built from the RESOLVED slots, not the requested ones, so every URL that
  // renders the same bytes carries the same ETag — `?slots=city,height` and
  // `?slots=height,city` and `?slots=nonsense` (which backfills to the
  // defaults) all revalidate against one entity instead of three.
  //
  // The qr state is the RESOLVED boolean for the same reason: `?qr=1`, `?qr=`
  // and no param at all are one entity, and the link card is one entity
  // whether or not somebody appended a `qr` it ignores.
  const identity = [
    bundle.profile.username,
    format,
    canonicalSlotKey(data.slots.map((slot) => slot.key)),
    qrOn ? "qr1" : "qr0",
    bundle.profile.updated_at,
  ].join("|")

  response.headers.set("ETag", `W/"${Buffer.from(identity).toString("base64url")}"`)

  return response
}
