/**
 * How big the name is allowed to be.
 *
 * Satori is not a browser: it does not shrink text to fit, and it does not
 * reflow an overflowing line — it draws it straight off the edge of the frame.
 * So the size is decided before rendering, from the name itself.
 *
 * The measure is the LONGEST WORD, not the total length. A long word cannot be
 * broken, so it is the word that sets the floor; "ARAVIND MENON" splits onto
 * two comfortable lines at 180px while "SUBRAMANIAN VENKATARAGHAVAN" cannot sit
 * at that size on any number of lines.
 */

import type { CardFormat } from "./types"

interface Rung {
  /** Applies when the longest word is at most this many characters. */
  maxWord: number
  story: number
  link: number
}

const LADDER: Rung[] = [
  { maxWord: 8, story: 180, link: 96 },
  { maxWord: 11, story: 150, link: 82 },
  { maxWord: 14, story: 124, link: 68 },
  { maxWord: Infinity, story: 104, link: 58 },
]

/** Bebas Neue at its card letter-spacing runs a shade over half its font size
 *  per character. Deliberately pessimistic — a name that lands a little small
 *  is fine, one that runs off the card is not. */
const CHAR_WIDTH_RATIO = 0.52

/** Below this nothing is worth rendering, and nothing real gets near it: a
 *  60-character single word still lands well above. */
const MIN_FONT_SIZE = 24

const FRAME_WIDTH: Record<CardFormat, number> = {
  // 1080 and 1200 minus the body's 80px / 56px side padding, both sides.
  story: 1080 - 160,
  link: 1200 - 112,
}

function longestWord(name: string): number {
  return name
    .trim()
    .split(/\s+/)
    .reduce((longest, word) => Math.max(longest, word.length), 0)
}

/**
 * The font size the name renders at, in px.
 *
 * The ladder's rung, then clamped to whatever actually fits. The clamp is
 * applied unconditionally rather than past some threshold, because "past which
 * length does the last rung stop fitting?" is a number that silently goes wrong
 * the moment a rung or the frame padding changes — and being wrong there means
 * a name printed off the edge of a card somebody has already posted. In
 * practice it binds only beyond 17 characters; every rung is sized to fit the
 * longest word it accepts.
 */
export function nameFontSize(name: string, format: CardFormat): number {
  const longest = longestWord(name)
  if (longest === 0) return LADDER[0][format === "story" ? "story" : "link"]

  const rung = LADDER.find((r) => longest <= r.maxWord) ?? LADDER[LADDER.length - 1]
  const size = format === "story" ? rung.story : rung.link

  const fits = Math.floor(FRAME_WIDTH[format] / (longest * CHAR_WIDTH_RATIO))
  return Math.max(Math.min(size, fits), MIN_FONT_SIZE)
}

/**
 * The name as lines.
 *
 * The story card splits on the LAST space, so "Aravind Kumar Menon" reads
 * "ARAVIND KUMAR / MENON" — the surname gets its own line, which is the shape
 * the reference was drawn to. The link card is a wide, short frame and stays on
 * one line.
 */
export function nameLines(name: string, format: CardFormat): string[] {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (!trimmed) return [""]
  if (format === "link") return [trimmed]

  const split = trimmed.lastIndexOf(" ")
  if (split === -1) return [trimmed]

  return [trimmed.slice(0, split), trimmed.slice(split + 1)]
}
