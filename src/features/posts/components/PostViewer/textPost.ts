/**
 * textPost — the rules of a text-only post in the full-screen viewer, kept
 * pure so they can be pinned in a node test without a DOM.
 *
 * A post with no media is shown as big text on a dark card. How big depends
 * on how much there is and on the script it is written in: Bebas Neue (the
 * display font) only has Latin glyphs, so anything else falls back to the
 * body font at a reading size rather than rendering in a system fallback
 * that looks nothing like the brand.
 */

import type { Post } from "@/features/posts/services/posts.api"

/** Media, or words: something the viewer can show full screen. */
export function isViewablePost(post: Post): boolean {
  return post.media.length > 0 || post.content.trim() !== ""
}

/**
 * True when every LETTER in `text` is Latin script. Digits, punctuation,
 * symbols and emoji are not letters and do not count either way, so an
 * emoji-only post is still Latin (the display font is fine for it).
 */
export function isLatinText(text: string): boolean {
  // A letter that is not Latin anywhere in the string → not Latin text.
  return !/(?!\p{Script=Latin})\p{L}/u.test(text)
}

export type TextPostSize = "display-xl" | "display-lg" | "body-lg" | "body"

/** Up to this many characters (and lines) reads as a headline. */
const DISPLAY_XL_MAX_CHARS = 60
/** Up to this many still fits the display font at the smaller size. */
const DISPLAY_LG_MAX_CHARS = 160
const MAX_SHORT_LINES = 5

/**
 * Which size a text post renders at. Measured on the trimmed text, in code
 * points (an emoji is one character, not two) and lines.
 *
 *   display-xl  Latin, ≤ 60 chars, ≤ 5 lines
 *   display-lg  Latin, ≤ 160 chars, ≤ 5 lines
 *   body-lg     not Latin, ≤ 160 chars, ≤ 5 lines
 *   body        everything else
 */
export function textPostSize(text: string): TextPostSize {
  const trimmed = text.trim()
  const chars = [...trimmed].length
  const lines = trimmed.split(/\r?\n/).length
  const fewLines = lines <= MAX_SHORT_LINES
  const short = fewLines && chars <= DISPLAY_XL_MAX_CHARS
  const medium = fewLines && chars <= DISPLAY_LG_MAX_CHARS

  if (isLatinText(trimmed)) {
    if (short) return "display-xl"
    if (medium) return "display-lg"
    return "body"
  }
  return medium ? "body-lg" : "body"
}

/**
 * One hashtag, the same charset as CONTENT_SPLIT_RE in PostCard.tsx (and so
 * the backend's HASHTAG_RE). Kept as its own literal rather than imported —
 * PostCard is a client component that pulls in the whole viewer, and this
 * module has to load in a node test — and pinned to the card's regex in
 * textPost.test.ts so the two cannot drift apart unnoticed.
 */
export const HASHTAG_SOURCE = "#[A-Za-z0-9_]{1,50}"

/** A run of hashtags (only hashtags and whitespace) that ends the text. */
const TRAILING_HASHTAGS_RE = new RegExp(
  `(?:^|\\s)(${HASHTAG_SOURCE}(?:\\s+${HASHTAG_SOURCE})*)$`
)

/**
 * Splits the hashtags a post ends with ("Match day! #kochi #football") off
 * the sentence, so the display sizes can show them on their own line under
 * the big text. Hashtags in the middle of a sentence stay where they are.
 * `tags` is "" when there is no trailing run, or when the post is nothing
 * but hashtags (there would be no body left to show big).
 */
export function splitTrailingHashtags(text: string): { body: string; tags: string } {
  const trimmed = text.trimEnd()
  const match = TRAILING_HASHTAGS_RE.exec(trimmed)
  if (!match) return { body: text, tags: "" }
  const body = trimmed.slice(0, match.index).trimEnd()
  if (!body) return { body: text, tags: "" }
  return { body, tags: match[1] }
}

/**
 * Desktop: should a wheel tick over the text box move to another post?
 * Not while the box can still scroll in the wheel's direction — the tick is
 * the reader scrolling the text. At the edge, or when the text fits, the
 * tick is the same "next post" gesture as over a photo.
 */
export function shouldWheelNavigate({
  deltaY,
  scrollTop,
  scrollHeight,
  clientHeight,
}: {
  deltaY: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): boolean {
  const maxScroll = scrollHeight - clientHeight
  // Sub-pixel scroll positions: within a pixel of the edge is the edge.
  if (maxScroll <= 1) return true
  if (deltaY > 0) return scrollTop >= maxScroll - 1
  if (deltaY < 0) return scrollTop <= 1
  return true
}
