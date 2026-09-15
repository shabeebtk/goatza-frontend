"use client"

/**
 * useVisualViewport — the VISIBLE area, as CSS variables on <html>.
 *
 * A `position: fixed` sheet is laid out against the layout viewport, which on
 * iOS Safari does not shrink when the keyboard comes up: `inset: 0` and `vh`
 * both keep describing the full screen, so a sheet's footer (the Send button,
 * the comment composer) sits under the keyboard, and when the keyboard goes
 * away the sheet moves while the finger is still down — which is how a tap
 * meant for one row lands on the next. `window.visualViewport` is the part
 * that is actually on screen, and these track it on every resize and scroll:
 *
 *   --vv-top          px from the top of the layout viewport to the visible area
 *   --vv-height       px height of the visible area
 *   --keyboard-inset  px hidden below the visible area (the keyboard, usually)
 *
 * A sheet with a text input positions its backdrop with the first two
 * (`top: var(--vv-top, 0px); height: var(--vv-height, 100dvh)`) so the whole
 * sheet, footer included, stays inside what the reader can see.
 *
 * Counted: several sheets can be open at once (comments over the viewer) and
 * the variables go when the last one closes.
 */

import { useEffect } from "react"

let users = 0

export const VISUAL_VIEWPORT_VARS = ["--vv-top", "--vv-height", "--keyboard-inset"] as const

function write() {
  const root = document.documentElement
  const vv = window.visualViewport
  const top = vv ? vv.offsetTop : 0
  const height = vv ? vv.height : window.innerHeight
  const inset = Math.max(0, window.innerHeight - height - top)

  root.style.setProperty("--vv-top", `${Math.round(top)}px`)
  root.style.setProperty("--vv-height", `${Math.round(height)}px`)
  root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`)
}

function clear() {
  const root = document.documentElement
  for (const name of VISUAL_VIEWPORT_VARS) root.style.removeProperty(name)
}

export function useVisualViewport(enabled = true) {
  useEffect(() => {
    if (!enabled) return

    if (users++ === 0) {
      write()
      window.visualViewport?.addEventListener("resize", write)
      window.visualViewport?.addEventListener("scroll", write)
      // No visualViewport (older engines): the window resize is the best there is.
      window.addEventListener("resize", write)
    }

    return () => {
      if (--users > 0) return
      users = 0
      window.visualViewport?.removeEventListener("resize", write)
      window.visualViewport?.removeEventListener("scroll", write)
      window.removeEventListener("resize", write)
      clear()
    }
  }, [enabled])
}
