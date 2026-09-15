"use client"

/**
 * useLoadMoreSentinel — the IntersectionObserver every post list pages with.
 *
 * Each list used to build its own observer inside an effect keyed on
 * `isFetchingNextPage`, so every fetch tore the observer down and made a new
 * one — and a new observer reports the sentinel's current state straight
 * away. With the sentinel still in range that report was a second request
 * on the heels of the first, and with the full-screen viewer paging the same
 * query at the same time, the server was doing every page's work twice.
 *
 * One observer for the life of the sentinel; the callback reads the latest
 * values from a ref. It stays quiet while a viewer is open (the viewer pages
 * on its own, through the same query) and while the last page failed (the
 * inline "Try again" row is the retry — an observer that fired again the
 * moment a failed fetch settled would hammer a server that is already
 * throttling). Coming out of either state, or out of a fetch, the sentinel
 * is observed afresh: it may still be in range with no intersection change
 * left to report, and a short page must not stall until the reader scrolls.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { usePostViewerStore } from "@/store/postViewer.store"

/** Prefetch the next page this far ahead so the reader never hits a wall. */
const ROOT_MARGIN = "600px"

export interface LoadMoreSentinelOptions {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** The last page failed: wait for the reader's retry. */
  isError?: boolean
  /** Call with `{ cancelRefetch: false }` — the viewer shares this query. */
  fetchNextPage: () => unknown
}

/** Returns the ref to put on the sentinel element. */
export function useLoadMoreSentinel({
  hasNextPage,
  isFetchingNextPage,
  isError = false,
  fetchNextPage,
}: LoadMoreSentinelOptions): (el: HTMLElement | null) => void {
  const viewerOpen = usePostViewerStore((s) => s.open)
  const idle = hasNextPage && !isFetchingNextPage && !isError && !viewerOpen

  const stateRef = useRef({ idle, fetchNextPage })
  useEffect(() => {
    stateRef.current = { idle, fetchNextPage }
  })

  // A callback ref rather than useRef: the sentinel mounts after the loading
  // skeleton, and an effect keyed on a plain ref would never see it arrive.
  const [el, setEl] = useState<HTMLElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (!entry?.isIntersecting) return
        const { idle: canFetch, fetchNextPage: fetch } = stateRef.current
        if (canFetch) fetch()
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 }
    )
    observer.observe(el)
    observerRef.current = observer
    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [el])

  // Back to idle (a fetch settled, the viewer closed, a retry succeeded):
  // ask the observer where the sentinel is now.
  const wasIdleRef = useRef(idle)
  useEffect(() => {
    const wasIdle = wasIdleRef.current
    wasIdleRef.current = idle
    if (!idle || wasIdle) return
    const observer = observerRef.current
    if (!observer || !el) return
    observer.unobserve(el)
    observer.observe(el)
  }, [idle, el])

  return useCallback((node: HTMLElement | null) => setEl(node), [])
}
