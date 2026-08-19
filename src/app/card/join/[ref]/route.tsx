/**
 * GET /card/join/<ref_code>
 *
 * The founding-player story card — the 1080×1920 image a signup drops into an
 * Instagram Story to show their number.
 *
 * NOT under `/api/` — that prefix is rewritten wholesale to Django by
 * `vercel.json`, so a route handler there is dead in production while working
 * perfectly in `next dev`. See JOIN_CARD_ROUTE in joinCard/cardUrl.ts.
 *
 * `nodejs`, not `edge`: same reason as the profile card. Three font files plus
 * the layout sit uncomfortably close to the edge bundle limit, and this route
 * is cached hard enough that cold-start latency does not matter.
 *
 * One format. There is no `?format=link` here because there is no page for a
 * crawler to scrape — /join is one landing page for everybody, not a per-player
 * URL with an OG tag to fill.
 */

import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

import { getFoundingPlayerCard } from "@/features/join/services/join.api"
import FoundingPlayerCard from "@/features/join/utils/joinCard/FoundingPlayerCard"
import { cardFonts } from "@/features/profile/utils/shareCard/fonts"
import {
  RETRY_AFTER_SECONDS,
  allowRender,
  clientKey,
} from "@/features/profile/utils/shareCard/rateLimit"
import { CARD_SIZES } from "@/features/profile/utils/shareCard/types"

export const runtime = "nodejs"

/**
 * An hour fresh, a day stale-while-revalidate — identical to the profile card.
 *
 * NO version parameter and NO ETag, and that is not an omission. The profile
 * card needs both because a profile is edited: `updated_at` moves, the ETag
 * moves, and the CDN entry is replaced. A signup row is immutable after
 * creation — `PlayerSignupService.create` writes it once, no endpoint updates
 * one, and a repeat submission returns the existing row untouched. One ref code
 * therefore means one image forever, so there is nothing a cache could ever be
 * holding that is stale, and nothing to bust it with.
 */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400"

/**
 * Not found, and deliberately indistinguishable from a typo.
 *
 * Same shape and same reasoning as the profile card's: the backend collapses
 * "no such ref code" into a plain 404 and `getFoundingPlayerCard` collapses an
 * unreachable API into the same null, so both land here. A ref code is short
 * and guessable enough to be enumerated; this route must not become a way to
 * confirm which ones exist any faster than the API already allows.
 */
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain",
      // Briefly cacheable: a dead link doing the rounds should not cost a
      // backend round trip every time, and 60s is short enough that a card
      // requested moments before its row committed starts working quickly.
      "Cache-Control": "public, max-age=60",
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params

  if (!allowRender(clientKey(request.headers))) {
    return new Response("Too many requests", {
      status: 429,
      headers: {
        "Content-Type": "text/plain",
        "Retry-After": String(RETRY_AFTER_SECONDS),
      },
    })
  }

  const signup = await getFoundingPlayerCard(ref)
  if (!signup || !signup.name || typeof signup.signup_number !== "number") {
    return notFound()
  }

  // Everything the card draws arrives ready to draw. `city` and `country_code`
  // need no translation — they are a place name and an ISO code from anywhere
  // in the world, not slugs out of a TextChoices list. The card no longer shows
  // the POSITION at all: the redesign gives the quiet line under the name to
  // the number and the place, and a third item there competed with both.
  //
  // `signup_number` is the backend's DISPLAY number. It arrives ready to print
  // and nothing here adjusts it — the raw row number never leaves the server.
  const { width, height } = CARD_SIZES.story

  const response = new ImageResponse(
    (
      <FoundingPlayerCard
        data={{
          name: signup.name,
          signupNumber: signup.signup_number,
          city: signup.city || null,
          countryCode: signup.country_code || null,
          isFounding: signup.is_founding === true,
        }}
      />
    ),
    {
      width,
      height,
      fonts: await cardFonts(),
    }
  )

  response.headers.set("Cache-Control", CACHE_CONTROL)

  return response
}
