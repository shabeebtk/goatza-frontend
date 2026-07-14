"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect } from "react"

/**
 * Smart "back" navigation.
 *
 * `router.back()` will happily walk the user out of the app when the current
 * page was opened directly (a shared link, a new tab, or a redirect from an
 * external site). To avoid that, we record the browser's `history.length` once
 * — when the authenticated app first mounts in this tab — and only call
 * `router.back()` while the history has grown past that baseline (i.e. there is
 * an in-app page to return to). Otherwise we push a safe fallback (the
 * dashboard).
 *
 * The baseline lives at module scope so it survives client-side navigations but
 * naturally resets on a full page reload (the module is re-evaluated), which is
 * exactly when a deep-linked page has no in-app history to go back to.
 */
let historyBaseline: number | null = null

/**
 * Records the history baseline once, at app entry. Mount this from a layout
 * that wraps every authenticated page so the baseline is captured before any
 * client-side navigation happens.
 */
export function useMarkAppEntry() {
  useEffect(() => {
    if (historyBaseline === null && typeof window !== "undefined") {
      historyBaseline = window.history.length
    }
  }, [])
}

/**
 * Returns a handler that goes back when there is in-app history, or navigates
 * to `fallback` (default: the user dashboard) when going back would leave the
 * app.
 */
export function useSmartBack(fallback = "/home") {
  const router = useRouter()

  return useCallback(() => {
    const canGoBack =
      typeof window !== "undefined" &&
      historyBaseline !== null &&
      window.history.length > historyBaseline

    if (canGoBack) {
      router.back()
    } else {
      router.push(fallback)
    }
  }, [router, fallback])
}
