"use client"

/**
 * useBackToClose — one history entry per overlay, so the phone's back
 * button/gesture closes the top-most overlay instead of navigating away.
 *
 * The pattern is the one MediaCarousel's lightbox and PostComments each grew
 * on their own: pushState an entry (SAME URL — ScrollToTop jumps to the top on
 * pathname changes and would lose the reader's place in the list) and close on
 * popstate. Where the copies broke down was stacking: the comments sheet over
 * the lightbox meant two entries and two listeners that both closed on ANY
 * popstate, so a single back press closed both.
 *
 * Here every open overlay is on a module-level stack and its DEPTH is written
 * into its history entry (`{ goatzaOverlay: { id, depth } }`). A popstate
 * reads the depth of the entry the browser landed on (0 for the page itself)
 * and closes exactly the overlays deeper than that, top-most first — so one
 * back closes one overlay, and `history.go(-n)` closes n of them.
 *
 * StrictMode: the push is guarded by a ref so the simulated mount→cleanup→mount
 * cycle pushes once, and the cleanup NEVER calls history.back() — on that same
 * cycle it would pop our entry and close the overlay the instant it opened.
 * Explicit closes go through requestClose() → back() → popstate.
 */

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/** Key under which an overlay's depth lives in `history.state`. */
export const OVERLAY_STATE_KEY = "goatzaOverlay"

type OverlayEntry = {
  id: number
  depth: number
  close: () => void
}

// Every open overlay, bottom to top. Module-level on purpose: the overlays are
// mounted by unrelated components (a card's comments sheet over a viewer) and
// the only thing they share is the browser's history.
const openOverlays: OverlayEntry[] = []
let nextOverlayId = 1
let listeners = 0
// Callbacks waiting for the next popstate — navigateAway() parks its push here.
let popWaiters: Array<() => void> = []
// One navigation at a time. A link inside a stacked overlay can reach two
// handlers (the viewer's root capture and the comments thread's own), and
// popstate has not landed between them — the second call would go() again.
let navigating = false

/**
 * If popstate never arrives (it is asynchronous, and a browser may swallow a
 * `go()` past the start of its history), navigateAway still proceeds after
 * this — a closed-looking overlay that never navigates is worse than a stray
 * history entry.
 */
const POP_FALLBACK_MS = 400

function depthOf(state: unknown): number {
  if (typeof state !== "object" || state === null) return 0
  const overlay = (state as Record<string, unknown>)[OVERLAY_STATE_KEY]
  if (typeof overlay !== "object" || overlay === null) return 0
  const depth = (overlay as { depth?: unknown }).depth
  return typeof depth === "number" ? depth : 0
}

/** Depth of the history entry the browser is on right now. */
function currentDepth(): number {
  if (typeof window === "undefined") return 0
  return depthOf(window.history.state)
}

/** Closes every overlay deeper than `depth`, top-most first. */
function closeDeeperThan(depth: number) {
  for (let i = openOverlays.length - 1; i >= 0; i--) {
    const entry = openOverlays[i]
    if (entry.depth > depth) {
      openOverlays.splice(i, 1)
      entry.close()
    }
  }
}

function onPopState() {
  closeDeeperThan(currentDepth())

  const waiting = popWaiters
  popWaiters = []
  waiting.forEach((resolve) => resolve())
}

function attachListener() {
  if (listeners === 0) window.addEventListener("popstate", onPopState)
  listeners++
}

function detachListener() {
  listeners--
  if (listeners === 0) window.removeEventListener("popstate", onPopState)
}

function removeFromStack(id: number) {
  const index = openOverlays.findIndex((entry) => entry.id === id)
  if (index !== -1) openOverlays.splice(index, 1)
}

function isTop(id: number): boolean {
  return openOverlays[openOverlays.length - 1]?.id === id
}

/** Runs `fn` after the next popstate, or after POP_FALLBACK_MS, whichever is first. */
function afterNextPop(fn: () => void) {
  let done = false
  const run = () => {
    if (done) return
    done = true
    window.clearTimeout(timer)
    fn()
  }
  const timer = window.setTimeout(run, POP_FALLBACK_MS)
  popWaiters.push(run)
}

export interface UseBackToCloseOptions {
  /** False → no history entry; requestClose() simply calls onClose. */
  enabled?: boolean
}

export interface BackToClose {
  /**
   * Close this overlay the way the back button would. On top of the stack it
   * goes through history.back() so the entry is consumed; underneath another
   * overlay it closes directly and leaves the stack consistent.
   */
  requestClose: () => void
  /**
   * Close EVERY open overlay and go to `href` without leaving overlay entries
   * behind: back past all of them first, wait for that popstate, then push.
   * Pressing back on the new page then returns to the list, not to a blank
   * "overlay" entry.
   */
  navigateAway: (href: string) => void
}

export function useBackToClose(
  onClose: () => void,
  { enabled = true }: UseBackToCloseOptions = {}
): BackToClose {
  const router = useRouter()

  // Keep onClose reachable from the one-shot history effect without making it
  // a dependency (callers pass a fresh arrow each render).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Assigned once, in the effect: fixed for the life of the component, so a
  // StrictMode remount re-registers the SAME overlay rather than a second one.
  const idRef = useRef<number | null>(null)
  const pushedRef = useRef(false)
  const depthRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    if (idRef.current === null) idRef.current = nextOverlayId++
    const id = idRef.current

    if (!pushedRef.current) {
      // One deeper than the entry we are on — not the stack length. After a
      // forward press the browser can sit on a stale overlay entry with nothing
      // open; measuring from history keeps a fresh overlay strictly deeper than
      // whatever is underneath, so one back still closes exactly it.
      depthRef.current = currentDepth() + 1
      window.history.pushState(
        { [OVERLAY_STATE_KEY]: { id, depth: depthRef.current } },
        ""
      )
      pushedRef.current = true
    }

    openOverlays.push({
      id,
      depth: depthRef.current,
      close: () => onCloseRef.current(),
    })
    attachListener()

    return () => {
      // Off the stack, but the history entry stays: calling back() here would
      // self-close on StrictMode's remount. A parent that unmounts an overlay
      // directly leaves one extra back press behind — same as before.
      removeFromStack(id)
      detachListener()
    }
  }, [enabled])

  const requestClose = useCallback(() => {
    const id = idRef.current
    if (!enabled || !pushedRef.current || id === null) {
      onCloseRef.current()
      return
    }
    // Only when the browser is actually ON our entry: after a forward press
    // it may be somewhere else, and back() would then close the wrong thing.
    if (isTop(id) && currentDepth() === depthRef.current) {
      window.history.back() // → popstate → close
      return
    }
    removeFromStack(id)
    onCloseRef.current()
  }, [enabled])

  const navigateAway = useCallback((href: string) => {
    if (navigating) return
    const depth = currentDepth()
    if (depth <= 0) {
      // Nothing of ours in history (disabled, or a stale entry was already
      // popped) — close whatever is open and go.
      closeDeeperThan(0)
      router.push(href)
      return
    }
    navigating = true
    afterNextPop(() => {
      navigating = false
      // The pop closed everything deeper than the page; this covers an
      // overlay that never pushed (enabled: false) and the fallback path.
      closeDeeperThan(0)
      router.push(href)
    })
    window.history.go(-depth)
  }, [router])

  return { requestClose, navigateAway }
}
