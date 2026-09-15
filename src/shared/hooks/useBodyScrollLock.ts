"use client"

/**
 * useBodyScrollLock — the ONE way the page is frozen behind an overlay.
 *
 * Counted rather than saved-and-restored per overlay. The old inline effects
 * each stashed the previous overflow and put it back on unmount, which is
 * right for one overlay and wrong for two: a viewer with a comments sheet on
 * top, closed viewer-first, restored the sheet's "hidden" as the viewer's
 * "previous" value — or unlocked the page while the sheet was still up,
 * depending on which unmounted first. With a module-level count the page is
 * locked by the first overlay in and released by the last one out, in any
 * order. Inline `document.body.style.overflow` locks are no longer allowed
 * anywhere: one of them, unaware of the count, would undo this.
 *
 * `overflow: hidden` on <body> is not a lock on iOS Safari. The page still
 * pans under a finger, the toolbar collapses and the fixed sheet drifts with
 * it, so the first lock also:
 *
 * - sets `overflow: hidden` on <html> AND <body>, `overscroll-behavior: none`
 *   on <html>, and `data-scroll-locked` on <html> for CSS to hook;
 * - keeps the desktop layout still: the classic scrollbar vanishing with the
 *   overflow would widen the viewport by its width and shift the fixed navs
 *   and every centred column by that much. `scrollbar-gutter: stable` keeps
 *   the gutter reserved while hidden (only when a scrollbar was actually
 *   there — a short page must not grow one); browsers without it get the
 *   same width as body padding;
 * - adds ONE non-passive `touchmove` listener on the document that cancels
 *   the gesture unless it can scroll something INSIDE the open overlay
 *   (`[aria-modal="true"]` or `[data-scroll-lock-root]`) — an element with
 *   `overflow: auto|scroll` and room to move on the gesture's axis, between
 *   the touch target and the overlay root. Two-finger touches (pinch-zoom),
 *   `input[type=range]` and anything under `[data-allow-touchmove]`
 *   (croppers, zoom, drag handles) are always let through.
 *
 * The last unlock removes all of it and leaves `window.scrollY` exactly where
 * it was: the page is never moved, and the "position: fixed body" trick is
 * deliberately not used — the post viewer's landing and iOS's own scroll
 * restoration both depend on the scroll position staying put underneath.
 */

import { useEffect } from "react"

let locks = 0

/** What <html>/<body> had before the FIRST lock; put back after the last. */
let saved: {
  rootOverflow: string
  rootOverscroll: string
  rootGutter: string
  bodyOverflow: string
  bodyPaddingRight: string
} | null = null

/** Where the first finger went down, for the gesture's axis. */
let touchStartX = 0
let touchStartY = 0

const ALLOW_SELECTOR = '[data-allow-touchmove], input[type="range"]'
const OVERLAY_SELECTOR = '[aria-modal="true"], [data-scroll-lock-root]'

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
}

/** Can `el` itself scroll on this axis — right overflow, and room to move? */
function isScrollable(el: Element, vertical: boolean): boolean {
  const overflow = vertical
    ? getComputedStyle(el).overflowY
    : getComputedStyle(el).overflowX
  if (overflow !== "auto" && overflow !== "scroll") return false
  return vertical
    ? el.scrollHeight > el.clientHeight
    : el.scrollWidth > el.clientWidth
}

function onTouchMove(e: TouchEvent) {
  // Pinch-zoom is the browser's, always.
  if (e.touches.length > 1 || !e.cancelable) return

  const raw = e.target
  const target =
    raw instanceof Element ? raw : raw instanceof Node ? raw.parentElement : null
  if (!target) {
    e.preventDefault()
    return
  }

  if (target.closest(ALLOW_SELECTOR)) return

  const overlay = target.closest(OVERLAY_SELECTOR)
  if (!overlay) {
    // The page behind the overlay: this is the scroll being locked.
    e.preventDefault()
    return
  }

  const touch = e.touches[0]
  const vertical = touch
    ? Math.abs(touch.clientY - touchStartY) >= Math.abs(touch.clientX - touchStartX)
    : true

  // Walk from the touch up to the overlay root: a scroll container with room
  // to move on this axis owns the gesture. Its own edge bounce stays with it
  // (`overscroll-behavior: contain` on every overlay scroller) rather than
  // chaining to the page.
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (isScrollable(el, vertical)) return
    if (el === overlay) break
  }

  e.preventDefault()
}

function lock() {
  if (locks++ > 0) return

  const root = document.documentElement
  const body = document.body

  saved = {
    rootOverflow: root.style.overflow,
    rootOverscroll: root.style.overscrollBehavior,
    rootGutter: root.style.scrollbarGutter,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
  }

  // Measured BEFORE the overflow changes: once hidden, the scrollbar is gone
  // and the two widths agree. A zero clientWidth is an environment with no
  // layout at all (jsdom), not a 1024px scrollbar.
  const scrollbarWidth =
    root.clientWidth > 0 ? window.innerWidth - root.clientWidth : 0

  root.setAttribute("data-scroll-locked", "")
  root.style.overflow = "hidden"
  root.style.overscrollBehavior = "none"
  body.style.overflow = "hidden"

  if (scrollbarWidth > 0) {
    if (
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("scrollbar-gutter", "stable")
    ) {
      root.style.scrollbarGutter = "stable"
    } else {
      body.style.paddingRight = `${scrollbarWidth}px`
    }
  }

  document.addEventListener("touchstart", onTouchStart, { passive: true })
  document.addEventListener("touchmove", onTouchMove, { passive: false })
}

function unlock() {
  if (--locks > 0) return
  locks = 0

  document.removeEventListener("touchstart", onTouchStart)
  document.removeEventListener("touchmove", onTouchMove)

  const root = document.documentElement
  const body = document.body

  root.removeAttribute("data-scroll-locked")
  root.style.overflow = saved?.rootOverflow ?? ""
  root.style.overscrollBehavior = saved?.rootOverscroll ?? ""
  root.style.scrollbarGutter = saved?.rootGutter ?? ""
  body.style.overflow = saved?.bodyOverflow ?? ""
  body.style.paddingRight = saved?.bodyPaddingRight ?? ""
  saved = null
}

export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    lock()
    return unlock
  }, [enabled])
}
