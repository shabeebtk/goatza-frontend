/**
 * Where a card lives.
 *
 * One builder for both callers — the OG tag on the profile page and the live
 * preview in the share sheet — so the URL shape can only be wrong in one place.
 */

import { canonicalSlotKey } from "./slots"
import { versionTag } from "./version"
import type { CardFormat } from "./types"

export const CARD_ROUTE = "/api/card/profile"

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
