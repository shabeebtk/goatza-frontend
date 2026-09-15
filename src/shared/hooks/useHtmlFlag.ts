"use client"

/**
 * useHtmlFlag — a counted `data-<name>` attribute on <html>, for CSS that
 * lives far from the component that knows the fact.
 *
 * Three flags today:
 *
 *   data-top-bar / data-bottom-bar   AppNav and OrgNav, while their mobile
 *                                    bars are mounted. The toasts offset
 *                                    themselves by the bars only when a bar
 *                                    is actually there — a public page has
 *                                    neither.
 *   data-chrome-covered              a full-screen overlay (the post viewer,
 *                                    the highlight viewer, the lightboxes)
 *                                    that sits over the bars. The toasts
 *                                    treat the bars as hidden while it is up.
 *
 * Counted per name, so two viewers stacked (a lightbox over the viewer) set
 * the flag once and clear it when the last one is gone.
 */

import { useEffect } from "react"

const counts = new Map<string, number>()

export function useHtmlFlag(name: string, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const attribute = `data-${name}`
    const root = document.documentElement
    const next = (counts.get(name) ?? 0) + 1
    counts.set(name, next)
    if (next === 1) root.setAttribute(attribute, "")

    return () => {
      const remaining = (counts.get(name) ?? 1) - 1
      if (remaining > 0) {
        counts.set(name, remaining)
        return
      }
      counts.delete(name)
      root.removeAttribute(attribute)
    }
  }, [name, enabled])
}
