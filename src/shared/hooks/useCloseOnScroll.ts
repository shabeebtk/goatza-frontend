"use client"

/**
 * useCloseOnScroll — close an ANCHORED dropdown when anything scrolls.
 *
 * A small menu hanging off its trigger does not lock the page (the sheets
 * do — see useBodyScrollLock); it closes instead, because once the trigger
 * has scrolled away the menu is floating next to nothing. The listener is on
 * the capture phase so a scroll inside a panel, not just the window, counts.
 */

import { useEffect, useRef } from "react"

export function useCloseOnScroll(enabled: boolean, onClose: () => void) {
  // Through a ref: callers pass an inline arrow, and re-subscribing on every
  // render of theirs would be pointless churn.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!enabled) return
    const handler = () => onCloseRef.current()
    window.addEventListener("scroll", handler, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", handler, { capture: true })
  }, [enabled])
}
