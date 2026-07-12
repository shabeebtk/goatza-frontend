"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * Resets window scroll to the top on forward (push) navigations.
 *
 * Next's App Router scrolls to top by default, but it misses same-segment
 * dynamic-route changes (e.g. /profile/a → /profile/b, /posts/1 → /posts/2) and
 * some cross-layout jumps — it reuses the segment and assumes nothing moved, so
 * the new page opens at the previous page's scroll offset.
 *
 * This runs on every pathname change EXCEPT:
 *   - back / forward (popstate) — the browser's restoration returns you where
 *     you were.
 *   - the initial render — don't fight native reload restoration or a deep link.
 *   - URLs with a hash (#section) — keep in-page anchor scrolling.
 *
 * Query-only updates (?q=, filters via router.replace) never change the
 * pathname, so those don't trigger a scroll — which is what the filter pages
 * that pass { scroll: false } rely on.
 */
export default function ScrollToTop() {
  const pathname = usePathname()
  const isPopNavigation = useRef(false)
  const isFirstRender = useRef(true)

  useEffect(() => {
    const onPopState = () => {
      isPopNavigation.current = true
      // Safety net: clear the flag even when the pop doesn't change the pathname
      // (e.g. back to the same path with a different query) so it can't go stale
      // and suppress a later push's scroll reset.
      window.setTimeout(() => {
        isPopNavigation.current = false
      }, 100)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (isPopNavigation.current) {
      isPopNavigation.current = false
      return
    }
    if (window.location.hash) return

    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
