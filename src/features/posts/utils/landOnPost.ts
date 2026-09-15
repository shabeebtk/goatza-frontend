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
 */

/** Upper bound on the settle loop; the usual case stops after two frames. */
const MAX_SETTLE_FRAMES = 10

/** Within this many px of the target counts as landed. */
const SETTLE_TOLERANCE_PX = 1

/** Brand outline on the card, fading out. */
const HIGHLIGHT_MS = 1200

export interface LandOnPostOptions {
  /** Flash a brand-green outline on the card once it is in place. */
  highlight?: boolean
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

function highlightCard(el: HTMLElement) {
  // Web Animations rather than a class: the card is a CSS Module and this
  // helper must not know its class names. Cleans itself up when it ends.
  if (typeof el.animate !== "function") return

  const brand =
    getComputedStyle(el).getPropertyValue("--color-brand").trim() || "#00B562"
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const outline = `3px solid ${brand}`
  el.animate(
    reduced
      // Reduced motion: hold, then drop — no fade to track.
      ? [
          { outline, outlineOffset: "2px" },
          { outline, outlineOffset: "2px" },
        ]
      : [
          { outline, outlineOffset: "2px", offset: 0 },
          { outline, outlineOffset: "2px", offset: 0.5 },
          { outline: "3px solid transparent", outlineOffset: "2px", offset: 1 },
        ],
    { duration: HIGHLIGHT_MS, easing: "ease-out" }
  )
}

/**
 * Scrolls the first `[data-post-id="<postId>"]` into place. Returns false and
 * does nothing when no such element is on the page.
 */
export function landOnPost(
  postId: string,
  { highlight = false }: LandOnPostOptions = {}
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
      if (highlight) highlightCard(el)
      return
    }
    requestAnimationFrame(settle)
  }
  requestAnimationFrame(settle)

  return true
}
