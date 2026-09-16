/**
 * landOnPost — put a post card at the top of the viewport, under the headers.
 *
 * Used when the full-screen viewer closes on a post other than the one it
 * opened on: the list underneath has not scrolled, so without this the reader
 * comes back to the post they left rather than the one they were looking at.
 *
 * The card's own `scroll-margin-top` is the offset (PostCard.module.css keeps
 * it in step with the shell's fixed headers, and Explore adds its sticky
 * search bar through --post-land-extra), so this needs to know nothing about
 * layouts. No smooth scrolling: the viewer is closing over it, and a jump that
 * happens under the fade reads as "already there".
 *
 * Once the card holds still, focus moves to its media tile — preventScroll,
 * and quiet unless the reader is on the keyboard (shared/services/
 * focusReturn.ts; the tile's :focus-visible ring after a tap WAS the "green
 * border after closing" bug) — so a keyboard user carries on from the post
 * they were reading. A guard then watches the window for a second: iOS
 * Safari puts a history entry's saved
 * scroll position back asynchronously, after the popstate that closed the
 * viewer and after this has already landed. useBackToClose stops that at the
 * source (scrollRestoration: manual); the guard is the safety net — a scroll
 * the reader did not start, that leaves the card off its offset, is landed
 * again, at most twice. The first touch, wheel or key ends the watch: from
 * then on every scroll is the reader's.
 */

import { returnFocus } from "@/shared/services/focusReturn"

/** Upper bound on the settle loop; the usual case stops after two frames. */
const MAX_SETTLE_FRAMES = 10

/** Within this many px of the target counts as landed. */
const SETTLE_TOLERANCE_PX = 1

/** How long after landing a scroll the reader did not start is corrected. */
const GUARD_MS = 1000

/** Re-landings the guard may do before it gives up. */
const MAX_RELANDS = 2

/** Any of these means the reader has taken over the scroll position. */
const READER_INTENT_EVENTS = [
  "touchstart",
  "wheel",
  "keydown",
  "pointerdown",
  "mousedown",
] as const

export interface LandOnPostOptions {
  /** The slide the reader was on: its tile takes focus (the first, otherwise). */
  slide?: number
}

function escapeId(id: string): string {
  // jsdom has no CSS.escape; ids are UUIDs, so the fallback only guards quotes.
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(id)
    : id.replace(/["\\]/g, "\\$&")
}

export function findPostElement(postId: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLElement>(`[data-post-id="${escapeId(postId)}"]`)
}

/** Scroll the window so `el`'s top sits `offset` px below the viewport top. */
function jumpTo(el: HTMLElement, offset: number) {
  const top = el.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" })
}

/**
 * The card's media tile for `slide` — the carousel's slides are the only
 * `role="button"` elements in a card, in slide order — or the card itself
 * when it has none (made focusable on the spot; `focus()` on an element
 * without a tabindex is a no-op).
 */
function focusTarget(card: HTMLElement, slide: number): HTMLElement {
  const tiles = card.querySelectorAll<HTMLElement>('[role="button"][tabindex]')
  const tile = tiles[slide] ?? tiles[0]
  if (tile) return tile
  if (!card.hasAttribute("tabindex")) card.tabIndex = -1
  return card
}

function focusCard(el: HTMLElement, slide: number) {
  // preventScroll is the whole point: a focus that scrolled would undo the
  // landing it follows. Quiet unless the reader is on the keyboard.
  returnFocus(focusTarget(el, slide))
}

/** True when `el` sits within tolerance of its landing offset. */
function isAtOffset(el: HTMLElement, offset: number): boolean {
  return Math.abs(el.getBoundingClientRect().top - offset) <= SETTLE_TOLERANCE_PX
}

/**
 * Watches for a scroll the reader did not start and lands again. The
 * listeners come off at the first sign of the reader, after MAX_RELANDS, or
 * when the guard's time is up — whichever is first.
 */
function guardLanding(el: HTMLElement, offset: number) {
  let relands = 0

  const stop = () => {
    window.clearTimeout(timer)
    window.removeEventListener("scroll", onScroll)
    for (const type of READER_INTENT_EVENTS) {
      window.removeEventListener(type, stop, true)
    }
  }

  const onScroll = () => {
    // The list re-rendered without the card: nothing left to hold in place.
    if (!el.isConnected) {
      stop()
      return
    }
    // Our own jumps fire scroll events too; they leave the card in place.
    if (isAtOffset(el, offset)) return
    relands++
    jumpTo(el, offset)
    if (relands >= MAX_RELANDS) stop()
  }

  const timer = window.setTimeout(stop, GUARD_MS)
  window.addEventListener("scroll", onScroll, { passive: true })
  for (const type of READER_INTENT_EVENTS) {
    // Capture, so a handler that stops propagation (the carousel's swipe)
    // cannot hide the reader's intent from the guard.
    window.addEventListener(type, stop, { capture: true, passive: true })
  }
}

/**
 * Scrolls the first `[data-post-id="<postId>"]` into place. Returns false and
 * does nothing when no such element is on the page.
 */
export function landOnPost(
  postId: string,
  { slide = 0 }: LandOnPostOptions = {}
): boolean {
  const el = findPostElement(postId)
  if (!el) return false

  const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0

  jumpTo(el, offset)

  // The list items use content-visibility: auto with an estimated 480px slot,
  // so a card that was never rendered can be measured wrong on the first jump
  // — and each card that renders on the way changes the ones below it. Keep
  // re-measuring for a few frames and stop once the card holds still where
  // it should be.
  let frames = 0
  let lastTop = el.getBoundingClientRect().top
  const settle = () => {
    frames++
    const top = el.getBoundingClientRect().top
    const landed = Math.abs(top - offset) <= SETTLE_TOLERANCE_PX
    const stable = Math.abs(top - lastTop) <= SETTLE_TOLERANCE_PX
    lastTop = top

    if (!landed) jumpTo(el, offset)

    if ((landed && stable) || frames >= MAX_SETTLE_FRAMES) {
      focusCard(el, slide)
      guardLanding(el, offset)
      return
    }
    requestAnimationFrame(settle)
  }
  requestAnimationFrame(settle)

  return true
}
