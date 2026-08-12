"use client"

import { useCallback, useEffect, useRef } from "react"

import { postImpressionsApi, sendImpressionsBeacon } from "../api/feed.api"

/**
 * Reports which feed posts the reader actually read.
 *
 * A post counts as seen once it has been at least 50% visible for a full
 * continuous second — scrolling past at speed is not reading, and the server
 * uses this to push read posts down the next ranking.
 *
 * Deliberately separate from the pagination observer in FeedList: that one
 * watches a single sentinel at threshold 0 with a 600px margin to prefetch
 * early, this one watches every card at threshold 0.5 with no margin. Merging
 * them would mean one of the two jobs being done wrong.
 *
 * Nothing here may block a render or surface an error. A dropped flush costs a
 * slightly staler ranking; a toast over telemetry the reader never asked for
 * costs their attention.
 */

// Flush once this many posts are buffered — small enough that a normal scroll
// reports continuously, large enough that it is not a request per post.
const FLUSH_THRESHOLD = 10

// How long a post must stay ≥50% visible before it counts.
const DWELL_MS = 1000

const VISIBILITY_THRESHOLD = 0.5

export function useImpressionTracker() {
  const observerRef = useRef<IntersectionObserver | null>(null)

  // element ↔ post id, both directions: the observer hands back elements, and
  // a stable ref callback needs to find the element it registered earlier.
  const postIdByNode = useRef(new Map<Element, string>())
  const nodeByPostId = useRef(new Map<string, Element>())

  const dwellTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const buffer = useRef<string[]>([])
  // Reported once per mount — re-reading a post while scrolling back up is the
  // same impression, not a second one.
  const reported = useRef(new Set<string>())

  // One stable callback per post id. Recreating these inline would make React
  // tear down and re-attach the observer on every render, restarting the dwell
  // timer each time and reporting almost nothing.
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>())

  const flush = useCallback((background = false) => {
    const pending = buffer.current
    if (pending.length === 0) return

    buffer.current = []

    if (background) {
      if (sendImpressionsBeacon(pending)) return
    }

    void postImpressionsApi(pending).catch(() => {
      // Swallowed on purpose — see the note at the top.
    })
  }, [])

  const markSeen = useCallback(
    (postId: string) => {
      if (reported.current.has(postId)) return

      reported.current.add(postId)
      buffer.current.push(postId)

      if (buffer.current.length >= FLUSH_THRESHOLD) {
        flush()
      }
    },
    [flush]
  )

  const clearTimer = useCallback((postId: string) => {
    const timer = dwellTimers.current.get(postId)
    if (timer) {
      clearTimeout(timer)
      dwellTimers.current.delete(postId)
    }
  }, [])

  const handleEntries = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const postId = postIdByNode.current.get(entry.target)
        if (!postId) continue

        const isVisible =
          entry.isIntersecting &&
          entry.intersectionRatio >= VISIBILITY_THRESHOLD

        if (!isVisible) {
          clearTimer(postId)
          continue
        }

        if (reported.current.has(postId) || dwellTimers.current.has(postId)) {
          continue
        }

        dwellTimers.current.set(
          postId,
          setTimeout(() => {
            dwellTimers.current.delete(postId)
            markSeen(postId)
          }, DWELL_MS)
        )
      }
    },
    [clearTimer, markSeen]
  )

  // Built lazily rather than in an effect: ref callbacks fire before effects
  // run, and they only ever fire in the browser.
  const getObserver = useCallback(() => {
    if (typeof IntersectionObserver === "undefined") return null
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(handleEntries, {
        threshold: VISIBILITY_THRESHOLD,
      })
    }
    return observerRef.current
  }, [handleEntries])

  const getPostRef = useCallback(
    (postId: string) => {
      const cached = refCallbacks.current.get(postId)
      if (cached) return cached

      const callback = (element: HTMLElement | null) => {
        const observer = getObserver()
        const previous = nodeByPostId.current.get(postId)

        if (previous) {
          observer?.unobserve(previous)
          postIdByNode.current.delete(previous)
          nodeByPostId.current.delete(postId)
        }

        if (!element) {
          clearTimer(postId)
          return
        }

        postIdByNode.current.set(element, postId)
        nodeByPostId.current.set(postId, element)
        observer?.observe(element)
      }

      refCallbacks.current.set(postId, callback)
      return callback
    },
    [clearTimer, getObserver]
  )

  useEffect(() => {
    // The maps are created once by useRef and never reassigned, so capturing
    // them here is identical to reading .current in the cleanup — and it keeps
    // the exhaustive-deps rule quiet about stale ref reads.
    const timers = dwellTimers.current
    const knownNodes = nodeByPostId.current

    // Re-attach every card the ref callbacks already registered. Effects run
    // after refs, and StrictMode's simulated remount tears this effect down
    // and back up — without this the second pass would leave the cards
    // registered but unobserved, and nothing would ever be reported in dev.
    const observer = getObserver()
    knownNodes.forEach((node) => observer?.observe(node))

    const onHidden = () => {
      if (document.visibilityState === "hidden") flush(true)
    }
    const onPageHide = () => flush(true)

    document.addEventListener("visibilitychange", onHidden)
    window.addEventListener("pagehide", onPageHide)

    return () => {
      document.removeEventListener("visibilitychange", onHidden)
      window.removeEventListener("pagehide", onPageHide)

      // Leaving the feed is the last chance to report what was read on it.
      flush(true)

      observerRef.current?.disconnect()
      observerRef.current = null
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      // The node maps deliberately survive: on a StrictMode remount the setup
      // above uses them to re-observe. On a real unmount they go with the hook.
    }
  }, [flush, getObserver])

  return { getPostRef }
}
