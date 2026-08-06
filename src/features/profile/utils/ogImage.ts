/**
 * The Open Graph image for a shared profile link.
 *
 * ─────────────────────────────────────────────────────────────
 * THIS IS THE SHARE-CARD SEAM.
 *
 * The generated share card — the designed 1200×630 image with the player's
 * name, sport, position and stats laid out on it — will replace the body of
 * `buildProfileOgImageUrl` and NOTHING ELSE. Every caller asks this one
 * function for a URL and does not care how it was produced, so swapping a
 * Cloudinary transform for a rendered card (an OG route, a pre-generated
 * asset, whatever wins) is a change to this file alone.
 *
 * Until then: a Cloudinary transform of the existing profile photo. It is not
 * a designed card, but it is a real face at the right aspect ratio, and a
 * WhatsApp link with a face in it gets opened where a bare link does not.
 * ─────────────────────────────────────────────────────────────
 */

/** What every platform expects. Also what the eventual card will be drawn at. */
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/**
 * `c_fill` crops to the exact box rather than letterboxing, `g_face` keeps the
 * subject's face in frame when there is one (Cloudinary falls back to a centre
 * crop when it finds none), and `b_auto` fills any remaining edge with a colour
 * sampled from the image instead of black bars.
 */
const TRANSFORM = [
  `c_fill`,
  `w_${OG_IMAGE_WIDTH}`,
  `h_${OG_IMAGE_HEIGHT}`,
  `g_face`,
  `b_auto`,
  `f_jpg`,
  `q_auto`,
].join(",")

/**
 * Fallback for a profile with no photo. A branded static asset, not a
 * transform: there is nothing to transform, and an OG tag pointing at a 404 is
 * worse than a generic card — several platforms drop the preview entirely.
 */
const FALLBACK_PATH = "/icons/icon-512.png"

/** Inject a transform segment into a Cloudinary delivery URL. */
function withTransform(url: string): string | null {
  // Cloudinary delivery URLs are .../<resource>/upload/<version>/<public_id>.
  // The transform goes immediately after `/upload/`.
  const marker = "/upload/"
  const at = url.indexOf(marker)
  if (at === -1) return null

  const head = url.slice(0, at + marker.length)
  let tail = url.slice(at + marker.length)

  // A URL that already carries a transform (a cropped avatar, say) would end up
  // with two stacked segments. Drop a leading one so the OG box always wins.
  const firstSegment = tail.split("/")[0] ?? ""
  if (/^[a-z]{1,3}_[^/]+/.test(firstSegment) && firstSegment.includes(",")) {
    tail = tail.slice(firstSegment.length + 1)
  }

  return `${head}${TRANSFORM}/${tail}`
}

/**
 * Absolute URL of the preview image for a profile.
 *
 * `siteOrigin` is required because OG images must be absolute — a relative path
 * is silently ignored by every scraper.
 */
export function buildProfileOgImageUrl(
  profile: { profile_photo?: string; cover_photo?: string; logo?: string; cover_image?: string },
  siteOrigin: string
): string {
  // Prefer the portrait over the cover: a face reads at thumbnail size in a
  // chat list, a wide stadium shot does not.
  const source =
    profile.profile_photo ||
    profile.logo ||
    profile.cover_photo ||
    profile.cover_image ||
    ""

  if (source && source.includes("res.cloudinary.com")) {
    const transformed = withTransform(source)
    if (transformed) return transformed
  }

  // Non-Cloudinary URL (shouldn't happen — all media goes through us) or no
  // photo at all.
  return `${siteOrigin}${FALLBACK_PATH}`
}
