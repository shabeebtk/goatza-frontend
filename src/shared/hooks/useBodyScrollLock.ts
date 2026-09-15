"use client"

/**
 * useBodyScrollLock — `overflow: hidden` on <body> while an overlay is open.
 *
 * Counted rather than saved-and-restored per overlay. The old inline effects
 * each stashed the previous overflow and put it back on unmount, which is
 * right for one overlay and wrong for two: a viewer with a comments sheet on
 * top, closed viewer-first, restored the sheet's "hidden" as the viewer's
 * "previous" value — or unlocked the page while the sheet was still up,
 * depending on which unmounted first. With a module-level count the body is
 * locked by the first overlay in and released by the last one out, in any
 * order.
 *
 * Overlays that still lock inline (the lightboxes, ReportSheet…) save and
 * restore whatever they find, so they nest with this correctly as long as the
 * counter's own first lock is not one of them — which holds today.
 */

import { useEffect } from "react"

let locks = 0
// What <body> had before the FIRST lock; put back after the last release.
let previousOverflow = ""

export function useBodyScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    if (locks === 0) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    locks++

    return () => {
      locks--
      if (locks === 0) document.body.style.overflow = previousOverflow
    }
  }, [enabled])
}
