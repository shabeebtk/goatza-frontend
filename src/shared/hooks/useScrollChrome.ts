"use client"

import { useEffect } from "react"

interface UseScrollChromeOptions {
  /** When false the hook is inert and forces the chrome fully visible. */
  enabled?: boolean
  /** Px of downward scroll needed to slide the bars fully off-screen. */
  hideDistance?: number
  /** Px of upward scroll needed to bring them fully back — smaller = reveals sooner. */
  revealDistance?: number
  /** Within this many px of the top, the chrome is always fully visible. */
  topOffset?: number
  /** Ms of scroll-idle before the bars settle (snap) to fully open/closed. */
  snapDelay?: number
}

const REVEAL_EVENT = "goatza:reveal-chrome"

/**
 * After a reveal, scrolling is not the reader's for this long: the keyboard
 * going away moves `window.scrollY` by itself, and following that would slide
 * the bars straight back off.
 */
const REVEAL_SETTLE_MS = 500

/**
 * Bring the bars back, now. For an overlay that has just closed: a composer
 * opened from the page (the profile's own Create button) can be opened with
 * the bars already scrolled away, and while the scroll is locked behind it
 * nothing would ever bring them back. A window event because the hook's state
 * lives in its effect, and the callers are nowhere near it.
 */
export function revealChrome(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(REVEAL_EVENT))
}

/**
 * Scroll-linked auto-hide for the mobile chrome (top bar + bottom nav).
 *
 * Instead of a binary "hidden" flip, the bars track the scroll *continuously*:
 * scrolling down slides them off proportionally, scrolling up brings them back,
 * so the motion follows the finger and never feels abrupt. When scrolling stops
 * the bars gently settle to fully open or fully closed (whichever is nearer).
 *
 * Implementation notes:
 *  - Publishes a single `--chrome-progress` custom property (0 = shown, 1 = hidden)
 *    on <html>; CSS turns that into a `transform: translateY(...)` on each bar.
 *    Writing a CSS var (not React state) means zero re-renders while scrolling.
 *  - `data-chrome-snap` on <html> toggles the CSS transition ON only for the
 *    settle, so the follow phase stays 1:1 with the scroll and the settle is smooth.
 *  - One passive listener, coalesced through requestAnimationFrame — no jank.
 */
export function useScrollChrome({
  enabled = true,
  hideDistance = 80,
  revealDistance = 44,
  topOffset = 8,
  snapDelay = 180,
}: UseScrollChromeOptions = {}): void {
  useEffect(() => {
    const root = document.documentElement

    const clearVars = () => {
      root.style.removeProperty("--chrome-progress")
      root.removeAttribute("data-chrome-snap")
    }

    if (!enabled) {
      // Ease back to fully visible, then drop the vars.
      root.setAttribute("data-chrome-snap", "")
      root.style.setProperty("--chrome-progress", "0")
      return clearVars
    }

    let progress = 0 // 0 = fully shown, 1 = fully hidden
    let lastY = window.scrollY
    let ticking = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let ignoreScrollUntil = 0

    const write = (p: number) => {
      progress = p < 0 ? 0 : p > 1 ? 1 : p
      root.style.setProperty("--chrome-progress", String(progress))
    }

    const settle = () => {
      // Enable the transition and snap to the nearer end.
      root.setAttribute("data-chrome-snap", "")
      write(progress > 0.5 ? 1 : 0)
    }

    const update = () => {
      ticking = false
      const y = window.scrollY

      if (performance.now() < ignoreScrollUntil) {
        lastY = y
        return
      }

      // Always fully visible near the top; ease in if we jumped here.
      if (y <= topOffset) {
        if (idleTimer) clearTimeout(idleTimer)
        root.setAttribute("data-chrome-snap", "")
        lastY = y
        write(0)
        return
      }

      // Follow phase — track the scroll 1:1 with no transition.
      root.removeAttribute("data-chrome-snap")
      const delta = y - lastY
      lastY = y
      if (delta !== 0) {
        write(progress + delta / (delta > 0 ? hideDistance : revealDistance))
      }

      // Settle once the scroll goes quiet.
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(settle, snapDelay)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    const onReveal = () => {
      if (idleTimer) clearTimeout(idleTimer)
      root.setAttribute("data-chrome-snap", "")
      lastY = window.scrollY
      ignoreScrollUntil = performance.now() + REVEAL_SETTLE_MS
      write(0)
    }

    // Initialise from the current position.
    write(window.scrollY <= topOffset ? 0 : progress)

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener(REVEAL_EVENT, onReveal)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener(REVEAL_EVENT, onReveal)
      if (idleTimer) clearTimeout(idleTimer)
      clearVars()
    }
  }, [enabled, hideDistance, revealDistance, topOffset, snapDelay])
}

export default useScrollChrome
