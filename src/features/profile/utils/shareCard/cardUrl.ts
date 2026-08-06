/**
 * Where a card lives.
 *
 * One builder for both callers — the OG tag on the profile page and the live
 * preview in the share sheet — so the URL shape can only be wrong in one place.
 */

import { canonicalSlotKey } from "./slots"
import { versionTag } from "./version"
import type { CardFormat } from "./types"

/**
 * Deliberately NOT under `/api/`.
 *
 * `vercel.json` rewrites every `/api/:path*` request straight to Django, so a
 * Next route handler under that prefix is unreachable in production — the
 * request never reaches Vercel's function, Django 404s a path it has never
 * heard of, and the only clue is a Cloudflare header on the response. Local dev
 * hides it completely: `next dev` does not apply `vercel.json`.
 *
 * `/api` belongs to the backend proxy in this architecture. Anything Next
 * serves itself lives outside it.
 */
export const CARD_ROUTE = "/card/profile"

interface CardUrlOptions {
  username: string
  format: CardFormat
  /** Story only. Ignored for `link`, which always uses the fixed defaults. */
  slots?: string[]
  /** The profile's `updated_at`. Busts the CDN cache on an edit. */
  updatedAt?: string | null
  /** Absolute origin. Required for the OG tag, omitted for an <img src>. */
  origin?: string
}

export function buildCardUrl({
  username,
  format,
  slots,
  updatedAt,
  origin = "",
}: CardUrlOptions): string {
  const params = new URLSearchParams({ format })

  // Canonically sorted, so reordering the picker's checkboxes does not mint a
  // second CDN entry for an image that renders identical bytes.
  if (format === "story" && slots?.length) {
    params.set("slots", canonicalSlotKey(slots))
  }

  params.set("v", versionTag(updatedAt))

  return `${origin}${CARD_ROUTE}/${encodeURIComponent(username)}?${params}`
}
