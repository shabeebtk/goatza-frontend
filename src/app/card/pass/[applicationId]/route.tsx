/**
 * GET /card/pass/<applicationId>
 *
 * The trial pass as a 1080×1350 image — a parent's lock screen, a group chat,
 * a printout at the gate.
 *
 * NOT under `/api/` — that prefix is rewritten wholesale to Django by
 * `vercel.json`, so a route handler there is dead in production while working
 * perfectly in `next dev`. Same reason the profile card lives at `/card/`.
 *
 * `nodejs`, not `edge`: three font files plus the layout sit uncomfortably
 * close to the edge bundle limit.
 *
 * NOT WORLD-READABLE BY ID, and this is the one real difference from the
 * profile card. A profile card is a public artifact; a pass names one player,
 * their age group and whether they have paid. So this route does not fetch
 * the pass itself — it FORWARDS the caller's own bearer token to the API and
 * lets the API's ownership rule decide. Anything that is not a 200 becomes a
 * 404 here, matching the API's behaviour of never confirming that an id it
 * will not serve is real.
 *
 * A CONSEQUENCE WORTH KNOWING: a browser sends no Authorization header on an
 * `<img src>`, so this URL cannot be used as one. The client fetches it with
 * the token and turns the blob into a download — see TrialPass.tsx.
 *
 * NO CACHING. A shared CDN entry for a personal, authenticated image is how
 * one player ends up looking at another's pass.
 */

import { ImageResponse } from "next/og"
import type { NextRequest } from "next/server"

import { cardFonts } from "@/features/profile/utils/shareCard/fonts"
import {
    RETRY_AFTER_SECONDS,
    allowRender,
    clientKey,
} from "@/features/profile/utils/shareCard/rateLimit"
import PassCard from "@/features/recruitments/utils/PassCard"
import type { TrialPass } from "@/features/recruitments/services/announcements.api"

export const runtime = "nodejs"

/** Portrait, and the aspect ratio a phone actually shows in a chat preview. */
const WIDTH = 1080
const HEIGHT = 1350

/**
 * Not found, and deliberately indistinguishable from "not yours" and "not
 * confirmed yet". The API already collapses those; so does this.
 */
function notFound() {
    return new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    })
}

/**
 * The caller's own token, forwarded. Read from the Authorization header the
 * client fetch sets — there is no cookie to fall back on, because the access
 * token is held in memory by the auth store and never persisted.
 */
function bearer(request: NextRequest): string | null {
    const header = request.headers.get("authorization") ?? ""
    return header.toLowerCase().startsWith("bearer ") ? header : null
}

async function loadPass(
    applicationId: string,
    authorization: string,
): Promise<TrialPass | null> {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")
    if (!base) return null

    try {
        const response = await fetch(
            `${base}/recruitments/applications/${applicationId}/pass`,
            {
                headers: { Authorization: authorization, "X-Actor-Type": "user" },
                cache: "no-store",
            },
        )
        if (!response.ok) return null

        const payload = await response.json()
        return (payload?.data as TrialPass) ?? null
    } catch {
        // A backend that is down is not a pass this caller may not see, but
        // there is nothing useful to render either way.
        return null
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ applicationId: string }> },
) {
    const { applicationId } = await params

    if (!allowRender(clientKey(request.headers))) {
        return new Response("Too many requests", {
            status: 429,
            headers: {
                "Content-Type": "text/plain",
                "Retry-After": String(RETRY_AFTER_SECONDS),
            },
        })
    }

    const authorization = bearer(request)
    if (!authorization) return notFound()

    const pass = await loadPass(applicationId, authorization)
    if (!pass) return notFound()

    const response = new ImageResponse(<PassCard pass={pass} />, {
        width: WIDTH,
        height: HEIGHT,
        fonts: await cardFonts(),
    })

    // Personal and authenticated: never shared, never stored.
    response.headers.set("Cache-Control", "private, no-store")

    return response
}
