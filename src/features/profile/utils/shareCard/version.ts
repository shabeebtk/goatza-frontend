/**
 * The card URL's cache-buster.
 *
 * The renderer is cached for an hour at the CDN and a day beyond that as
 * stale-while-revalidate, which is what makes a viral link cheap — and exactly
 * what would pin a stale card to an edited profile. Changing the URL is the
 * only bust a scraper honours: several never re-request an image URL they have
 * already seen, whatever the headers say.
 *
 * A hash rather than the raw timestamp because the timestamp is twenty-odd
 * characters of colons and dots in a URL people paste into chat apps, and eight
 * hex characters carry the same "has this changed?" signal.
 */

/**
 * Bump whenever the card's composition changes.
 *
 * `updated_at` busts the cache when the PROFILE changes, which is the only bust
 * that mattered while the layout was fixed. It does nothing for a layout
 * change: a profile nobody has edited keeps the same tag, so the CDN keeps
 * serving the old picture — for up to a day on the stale window, and forever to
 * the scrapers that never re-request an image URL they have already seen. The
 * card is the artifact people share; shipping a redesign that only reaches
 * recently-edited profiles is not shipping it.
 *
 *   1 — the original composition.
 *   2 — the QR footer.
 */
export const CARD_LAYOUT_VERSION = 2

/** FNV-1a. Not cryptographic and does not need to be — a collision costs one
 *  stale card, and the input is a monotonically increasing timestamp. */
export function versionTag(updatedAt: string | null | undefined): string {
  // The layout version is folded into the hash rather than appended to the URL
  // as a second param, so the tag stays eight hex characters and the URL shape
  // does not change every time the card is redesigned.
  //
  // A missing timestamp hashes rather than short-circuiting to a sentinel: a
  // profile we have no `updated_at` for still has to pick up a redesign.
  const input = `${CARD_LAYOUT_VERSION}|${updatedAt ?? ""}`

  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16)
}
