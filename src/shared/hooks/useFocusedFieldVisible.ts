"use client"

/**
 * useFocusedFieldVisible — keep the focused text field on screen inside a
 * scroll container while the keyboard is up.
 *
 * A sheet that follows the visual viewport (useVisualViewport) shrinks when
 * the keyboard opens, but its scrollable body keeps the offset it had, so the
 * field that was just tapped is often left below the body's new bottom edge —
 * under the footer, or off the sheet entirely. The browser's own
 * scroll-into-view runs on focus, BEFORE the keyboard has resized anything,
 * so it does not help.
 *
 * This scrolls the container (only the container — never the page, which is
 * locked) so the active input/textarea sits inside it with a little margin,
 * on every focus and again on every visual-viewport resize.
 *
 * `insets` are for a container that has sticky parts of its own (the create
 * page's header and footer are sticky INSIDE its one scroll container): the
 * px they cover at the top and bottom, read live on every reveal. Both
 * default to 0, which is the sheet case — a sheet's footer sits outside its
 * scrolling body.
 */

import { useEffect, useRef, type RefObject } from "react"

const FIELD = 'input:not([type="hidden"]), textarea, [contenteditable="true"]'
const MARGIN = 16

export type FocusedFieldInsets = {
  /** Px covered at the container's top (a sticky header), measured now. */
  top?: () => number
  /** Px covered at the container's bottom (a sticky footer), measured now. */
  bottom?: () => number
}

export function useFocusedFieldVisible(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
  insets?: FocusedFieldInsets
) {
  // Callers pass a fresh object each render; the listeners read the latest.
  const insetsRef = useRef(insets)
  useEffect(() => { insetsRef.current = insets })

  useEffect(() => {
    if (!enabled) return
    let raf = 0

    // One frame later: on focus so the keyboard-driven resize has been
    // applied to the sheet, on resize so the new CSS variables have laid out.
    const reveal = () => {
      window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        const root = containerRef.current
        const el = document.activeElement
        if (!root || !(el instanceof HTMLElement)) return
        if (!root.contains(el) || !el.matches(FIELD)) return

        const r = root.getBoundingClientRect()
        const e = el.getBoundingClientRect()
        const top = r.top + (insetsRef.current?.top?.() ?? 0) + MARGIN
        const bottom = r.bottom - (insetsRef.current?.bottom?.() ?? 0) - MARGIN
        if (e.bottom > bottom) {
          root.scrollTop += e.bottom - bottom
        } else if (e.top < top) {
          root.scrollTop -= top - e.top
        }
      })
    }

    // focusin on document, not the container: the container may mount later
    // than this effect (a loading screen first), and focusin bubbles.
    document.addEventListener("focusin", reveal)
    window.visualViewport?.addEventListener("resize", reveal)
    window.addEventListener("resize", reveal)
    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener("focusin", reveal)
      window.visualViewport?.removeEventListener("resize", reveal)
      window.removeEventListener("resize", reveal)
    }
  }, [containerRef, enabled])
}
