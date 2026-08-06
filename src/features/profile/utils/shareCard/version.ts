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

/** FNV-1a. Not cryptographic and does not need to be — a collision costs one
 *  stale card, and the input is a monotonically increasing timestamp. */
export function versionTag(updatedAt: string | null | undefined): string {
  if (!updatedAt) return "0"

  let hash = 0x811c9dc5
  for (let i = 0; i < updatedAt.length; i++) {
    hash ^= updatedAt.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16)
}
