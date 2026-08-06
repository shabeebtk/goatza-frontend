/**
 * Pre-sized Cloudinary derivatives for the two images on the card.
 *
 * Every image on a Satori render is a network round trip INSIDE the render, so
 * the originals are never requested — a 4MB phone photo would dominate the
 * response time of an endpoint that has to answer a crawler in a couple of
 * seconds. Cloudinary does the resize once and caches it at its own edge.
 */

import type { CardFormat } from "./types"

/** `f_png` rather than `f_jpg`: the avatar sits in a round container and Satori
 *  composites it, so a format that can carry an alpha channel avoids a hard
 *  square edge if the source has one. */
const AVATAR_TRANSFORM = "c_fill,g_face,w_320,h_320,f_png,q_auto"

/**
 * `g_auto` rather than `g_face`: a cover is a scene, not a portrait, and a
 * face-crop on a stadium shot picks the wrong 520px. A dark scrim sits over
 * the result, which is forgiving of a modest source.
 *
 * One derivative per format rather than one shared 1080×520. The story card
 * uses the cover as a band and the link card as a full bleed, and pointing the
 * 1200×630 frame at a 1080-wide image is the upscale the card is not allowed to
 * do. Cover dimensions are not stored on UserProfile, so a small SOURCE is
 * still upscaled by Cloudinary behind the scrim — acceptable for now, and a
 * one-field follow-up if it ever becomes visible.
 */
const COVER_TRANSFORMS: Record<CardFormat, string> = {
  story: "c_fill,g_auto,w_1080,h_520,f_jpg,q_auto",
  link: "c_fill,g_auto,w_1200,h_630,f_jpg,q_auto",
}

/**
 * Inject a transform segment into a Cloudinary delivery URL.
 *
 * Returns null for anything that is not one — all our media goes through
 * Cloudinary, and a card is better off falling back to its branded pattern
 * than embedding a URL Satori will fail to fetch mid-render.
 */
function withTransform(url: string, transform: string): string | null {
  const marker = "/upload/"
  const at = url.indexOf(marker)
  if (at === -1) return null

  const head = url.slice(0, at + marker.length)
  let tail = url.slice(at + marker.length)

  // A URL that already carries a transform (a cropped avatar) would end up with
  // two stacked segments. Drop the leading one so the card's box wins.
  const firstSegment = tail.split("/")[0] ?? ""
  if (/^[a-z]{1,3}_[^/]+/.test(firstSegment) && firstSegment.includes(",")) {
    tail = tail.slice(firstSegment.length + 1)
  }

  return `${head}${transform}/${tail}`
}

export function avatarDerivative(url: string | null | undefined): string | null {
  return url ? withTransform(url, AVATAR_TRANSFORM) : null
}

export function coverDerivative(
  url: string | null | undefined,
  format: CardFormat
): string | null {
  return url ? withTransform(url, COVER_TRANSFORMS[format]) : null
}
