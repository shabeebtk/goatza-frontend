"use client"

import { useEffect, useState, type RefObject } from "react"

/** The nav's height: an element has gone once it is under it. */
export const NAV_HEIGHT = 56

/**
 * True once `ref`'s element has scrolled up under the nav, false again when it
 * comes back. One IntersectionObserver for the life of the element, gone on
 * unmount. The page's section bar and the phone's Enquire bar both watch the
 * profile header's action row with it.
 */
export function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? NAV_HEIGHT
        setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1)
      },
      { rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px` }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return past
}
