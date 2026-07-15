import type { PostMedia } from "@/features/posts/services/posts.api"

/**
 * Instagram-style clamped aspect ratios for post media containers.
 *
 * The feed uses ONE computed ratio (from the first media item) for the whole
 * carousel so every slide shares an identical, space-reserved box — no layout
 * shift, no per-slide jumps. The ratio is clamped so tall/wide extremes never
 * dominate the feed; the uncropped original is still viewable in the lightbox.
 */

/** Portrait floor — 4:5 (0.8). Anything taller is clamped to this. */
export const POST_RATIO_MIN = 0.8
/** Landscape ceiling — 16:9 (1.7778). Anything wider is clamped to this. */
export const POST_RATIO_MAX = 16 / 9
/** Fallback when dimensions are missing/invalid — 1:1 square. */
export const POST_RATIO_FALLBACK = 1

type Dimensioned = Pick<PostMedia, "width" | "height">

/**
 * Aspect ratio (width ÷ height) for a post's media container, derived from the
 * FIRST media item and clamped to [POST_RATIO_MIN, POST_RATIO_MAX].
 * Returns POST_RATIO_FALLBACK (square) when the first item has no usable
 * dimensions — legacy posts before the dimension backfill still render cleanly.
 */
export function getPostAspectRatio(media: readonly Dimensioned[]): number {
  const first = media[0]
  if (!first) return POST_RATIO_FALLBACK

  const { width, height } = first
  if (!width || !height || width <= 0 || height <= 0) return POST_RATIO_FALLBACK

  const ratio = width / height
  if (!Number.isFinite(ratio) || ratio <= 0) return POST_RATIO_FALLBACK

  return Math.min(POST_RATIO_MAX, Math.max(POST_RATIO_MIN, ratio))
}
