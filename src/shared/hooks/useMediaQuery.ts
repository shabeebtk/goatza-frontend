"use client"

/**
 * useMediaQuery — a live `matchMedia` result, via useSyncExternalStore so a
 * resize across the breakpoint re-renders exactly the component that asked.
 *
 * The server snapshot is `false`: anything that branches on this must be
 * something the server does not render (a portalled overlay), or it will
 * hydrate one way and immediately flip.
 */

import { useCallback, useSyncExternalStore } from "react"

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {}
      }
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false
    }
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
