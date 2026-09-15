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
 * Scroll restoration is taken over while anything is open. iOS Safari saves
 * a scroll position on the page's entry and puts it back when a pop lands on
 * that entry — asynchronously, AFTER the popstate handler and after
 * landOnPost has moved the list to the post the reader was on, which is why
 * closing the viewer on an iPhone showed the post it was opened on. Setting
 * `history.scrollRestoration = "manual"` on the page's entry stops that.
 * It has to happen before the first pushState: a new entry inherits the mode
 * of the entry it is pushed from, and the browser consults the mode of the
 * entry it goes back TO. The previous value goes back a second after the
 * last overlay has closed — never inside the popstate handler (WebKit reads
 * the flag right after dispatching it) and not before landing has settled.
 * navigateAway restores it before pushing, so back from the new page still
 * puts the list where it was, the normal way.
 *
 * StrictMode: the push is guarded by a ref so the simulated mount→cleanup→mount
 * cycle pushes once, and the cleanup NEVER calls history.back() — on that same
 * cycle it would pop our entry and close the overlay the instant it opened.
 * Explicit closes go through requestClose() → back() → popstate. A REAL
 * unmount (the list rendering its error state over an open viewer) would
 * leave the entry behind, and back would then seem to do nothing; the cleanup
 * defers a check that pops orphaned entries, and the remount cancels it.
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
// Pops we have asked for (back(), go()) whose popstate has not landed yet.
// The orphan check waits these out: judging history while one is in flight
// would pop a second time and leave the page.
let popsInFlight = 0

/**
 * If popstate never arrives (it is asynchronous, and a browser may swallow a
 * `go()` past the start of its history), navigateAway still proceeds after
 * this — a closed-looking overlay that never navigates is worse than a stray
 * history entry.
 */
const POP_FALLBACK_MS = 400

/**
 * How long after the last overlay closes `history.scrollRestoration` gets its
 * previous value back. Long enough for landOnPost to settle and for its guard
 * to have watched a while; short enough that a link tapped on the landed
 * card still pushes from an entry in its normal mode.
 */
export const SCROLL_RESTORATION_RESTORE_MS = 1000

// The mode the page's entry had before the first overlay took it over; null
// while it is not ours to give back.
let scrollRestorationBefore: History["scrollRestoration"] | null = null
let scrollRestorationTimer: number | null = null

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

function cancelScrollRestorationRestore() {
  if (scrollRestorationTimer === null) return
  window.clearTimeout(scrollRestorationTimer)
  scrollRestorationTimer = null
}

/** Before the first overlay's pushState: the page's entry goes manual. */
function takeScrollRestoration() {
  cancelScrollRestorationRestore()
  if (scrollRestorationBefore !== null) return
  if (!("scrollRestoration" in window.history)) return
  scrollRestorationBefore = window.history.scrollRestoration
  window.history.scrollRestoration = "manual"
}

/** Give the page's entry its previous mode back, now. */
function restoreScrollRestoration() {
  cancelScrollRestorationRestore()
  if (scrollRestorationBefore === null) return
  window.history.scrollRestoration = scrollRestorationBefore
  scrollRestorationBefore = null
}

/** The last overlay is gone: give the mode back once landing has settled. */
function scheduleScrollRestorationRestore() {
  if (scrollRestorationBefore === null) return
  cancelScrollRestorationRestore()
  scrollRestorationTimer = window.setTimeout(() => {
    scrollRestorationTimer = null
    restoreScrollRestoration()
  }, SCROLL_RESTORATION_RESTORE_MS)
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
  if (openOverlays.length === 0) scheduleScrollRestorationRestore()
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
  if (openOverlays.length === 0) scheduleScrollRestorationRestore()
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

/**
 * history.go(-n) with the in-flight count kept, so the orphan check can wait
 * for it. The count comes back down on the popstate — or on the same
 * fallback navigateAway uses, since a go() past the start of history never
 * produces one. Holds the popstate listener meanwhile: the orphan pop runs
 * after the last overlay has detached, and nothing else would hear it land.
 */
function pop(n: number) {
  popsInFlight++
  attachListener()
  afterNextPop(() => {
    popsInFlight = Math.max(0, popsInFlight - 1)
    detachListener()
  })
  window.history.go(-n)
}

/**
 * Pops every entry above the deepest overlay still open. Called after an
 * overlay has really unmounted with its entry still in history — nothing
 * would ever close on those entries, so a back press would look like it did
 * nothing. Waits for any pop of ours to land first, so a close that is
 * already on its way through history.back() is not popped twice.
 */
function popOrphanEntries() {
  if (popsInFlight > 0) {
    afterNextPop(popOrphanEntries)
    return
  }
  if (navigating) return
  const deepestOpen = openOverlays.reduce((max, entry) => Math.max(max, entry.depth), 0)
  const orphaned = currentDepth() - deepestOpen
  if (orphaned <= 0) return
  pop(orphaned)
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
  // The orphan check the cleanup defers; the remount cancels it.
  const orphanCheckRef = useRef<number | null>(null)

  useEffect(() => {
    if (orphanCheckRef.current !== null) {
      // StrictMode's remount, not a real unmount: the entry is still wanted.
      window.clearTimeout(orphanCheckRef.current)
      orphanCheckRef.current = null
    }
    if (!enabled) return

    if (idRef.current === null) idRef.current = nextOverlayId++
    const id = idRef.current

    if (!pushedRef.current) {
      // The stack is about to go from empty to one: the page's entry must be
      // manual BEFORE the push, or the new entry inherits "auto" and a pop
      // back onto the page restores the scroll position over the landing.
      if (openOverlays.length === 0) takeScrollRestoration()
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
    // An overlay is open (again): whatever restore was pending is off.
    cancelScrollRestorationRestore()

    openOverlays.push({
      id,
      depth: depthRef.current,
      close: () => onCloseRef.current(),
    })
    attachListener()

    return () => {
      // Off the stack, but the history entry stays: calling back() here would
      // self-close on StrictMode's remount. The orphan check is deferred a
      // tick for exactly that reason — the remount is synchronous and cancels
      // it; a real unmount lets it run and pop our entry if it is still there.
      removeFromStack(id)
      detachListener()
      orphanCheckRef.current = window.setTimeout(() => {
        orphanCheckRef.current = null
        pushedRef.current = false
        popOrphanEntries()
      }, 0)
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
      pop(1) // → popstate → close
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
      restoreScrollRestoration()
      router.push(href)
      return
    }
    navigating = true
    afterNextPop(() => {
      navigating = false
      // The pop closed everything deeper than the page; this covers an
      // overlay that never pushed (enabled: false) and the fallback path.
      closeDeeperThan(0)
      // Back from the destination has to restore the list's scroll position
      // the normal way, so the page's entry gets its mode back before the
      // push — the new entry inherits it.
      restoreScrollRestoration()
      router.push(href)
    })
    pop(depth)
  }, [router])

  return { requestClose, navigateAway }
}
