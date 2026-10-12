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
 * entry it goes back TO. The previous value goes back after the last
 * overlay has closed — deferred to the reader's first pointer or key, or a
 * second, whichever is first: never inside the popstate handler (WebKit
 * reads the flag right after dispatching it) and not before landing has
 * settled. navigateAway restores it before pushing, so back from the new
 * page still puts the list where it was, the normal way.
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

/**
 * What an overlay writes into its own history entry.
 *
 * `restore` is OPAQUE here: this hook carries it and hands it back, and has
 * no opinion about what is in it. The post viewer puts the post and slide the
 * reader is on into it, so that coming back to the entry can reopen the
 * viewer where they left it. Nothing else uses it today.
 *
 * NOTE ON NEXT: we pushState with our own object and no URL. Next's app
 * router PATCHES history.pushState/replaceState and copies its own `__NA`
 * and route-tree keys into any state it did not write itself — which is what
 * makes an overlay entry survivable: a back press that lands on one gives
 * Next a state it recognises and it traverses to the same route, instead of
 * taking the `if (!event.state.__NA) window.location.reload()` branch. The
 * replaceState below spreads the existing state for the same reason.
 */
type OverlayHistoryState = { id: number; depth: number; restore?: unknown }

/**
 * Overlay ids whose history entry is deliberately outstanding while the
 * component is gone — see navigateKeeping. Without this the unmount that the
 * route change causes would look exactly like an abandoned overlay and the
 * orphan check would pop the very entry we are navigating on top of.
 */
const suspendedIds = new Set<number>()

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
 * previous value back, at the latest: long enough for landOnPost to settle
 * and for its guard to have watched a while.
 */
export const SCROLL_RESTORATION_RESTORE_MS = 1000

/**
 * The reader's first pointer or key after the close restores the mode
 * early. Landing is over once the reader is driving (landOnPost's guard
 * stops on the same signal), and a link tapped on the landed card inside
 * the second would otherwise push an entry that inherits "manual" and leave
 * the page's entry in it — back from that page would then not restore the
 * list's position.
 */
const RESTORE_ON_INTENT_EVENTS = ["pointerdown", "keydown"] as const

// The mode the page's entry had before the first overlay took it over; null
// while it is not ours to give back.
let scrollRestorationBefore: History["scrollRestoration"] | null = null
let scrollRestorationTimer: number | null = null

/** The overlay payload on a history state, or null when it is not ours. */
function overlayStateOf(state: unknown): OverlayHistoryState | null {
  if (typeof state !== "object" || state === null) return null
  const overlay = (state as Record<string, unknown>)[OVERLAY_STATE_KEY]
  if (typeof overlay !== "object" || overlay === null) return null
  const { id, depth } = overlay as { id?: unknown; depth?: unknown }
  if (typeof id !== "number" || typeof depth !== "number") return null
  return overlay as OverlayHistoryState
}

/**
 * The restore payload on the entry the browser is on, or null.
 *
 * Module-level and readable without the hook on purpose: the component that
 * decides whether to OPEN an overlay has to know before it renders, which is
 * before any overlay exists to hold a hook.
 */
export function readRestoreState(): unknown | null {
  if (typeof window === "undefined") return null
  return overlayStateOf(window.history.state)?.restore ?? null
}

/**
 * Drop the restore payload from the entry the browser is on.
 *
 * For the owner that read one it cannot use — a payload saying "the viewer
 * was on post X" is worthless to a page whose list came back empty after a
 * reload, and left in place it would spring the viewer open on some later
 * press. Module-level for the same reason readRestoreState is: the decision
 * is made before any overlay exists.
 */
export function clearRestoreState(): void {
  if (typeof window === "undefined") return
  const current = overlayStateOf(window.history.state)
  if (!current || current.restore === undefined) return
  const withoutRestore = { ...current }
  delete withoutRestore.restore
  window.history.replaceState(
    {
      ...(window.history.state as Record<string, unknown>),
      [OVERLAY_STATE_KEY]: withoutRestore,
    },
    ""
  )
}

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
  for (const type of RESTORE_ON_INTENT_EVENTS) {
    window.removeEventListener(type, restoreScrollRestoration, true)
  }
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

/**
 * The last overlay is gone: give the mode back once landing has settled —
 * on the reader's first pointer or key, or after the timeout.
 */
function scheduleScrollRestorationRestore() {
  if (scrollRestorationBefore === null) return
  cancelScrollRestorationRestore()
  scrollRestorationTimer = window.setTimeout(() => {
    scrollRestorationTimer = null
    restoreScrollRestoration()
  }, SCROLL_RESTORATION_RESTORE_MS)
  for (const type of RESTORE_ON_INTENT_EVENTS) {
    window.addEventListener(type, restoreScrollRestoration, { capture: true, passive: true })
  }
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
  /**
   * Mount onto the overlay entry the browser is ALREADY sitting on instead
   * of pushing a new one.
   *
   * For the way back from a navigateKeeping: the reader presses back, the
   * browser lands on the entry the overlay left behind, the page remounts
   * and the overlay opens again — all while that entry is the current one.
   * Pushing here would stack a duplicate and take two back presses to undo.
   * The id and depth come from the entry, so the overlay picks up exactly
   * the identity it had before it was suspended.
   *
   * Ignored when the current entry is not an overlay entry, so a caller that
   * passes it wrongly simply gets the ordinary push.
   */
  adoptCurrentEntry?: boolean
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
  /**
   * Go to `href` and LEAVE THIS OVERLAY'S ENTRY WHERE IT IS.
   *
   * The opposite trade from navigateAway: the destination is pushed on top
   * of the overlay entry rather than in place of it, so history reads
   * [page] → [overlay] → [destination] and one back press comes back to the
   * overlay rather than past it. Nothing is closed and no close callback
   * runs — the overlay is suspended, not finished — so the owner is
   * responsible for hiding it, and for reopening it on the way back (see
   * readRestoreState and adoptCurrentEntry).
   *
   * Opt-in, and the post viewer is the only caller: for a nav sheet or a
   * lightbox, coming back to a reopened overlay is wrong.
   */
  navigateKeeping: (href: string) => void
  /**
   * Store an opaque value on THIS overlay's history entry, for the mount
   * that adopts it later to read back. Replaces, never pushes, and does
   * nothing at all unless the entry the browser is on is this overlay's —
   * with a sheet open on top of us, the current entry is the sheet's.
   */
  setRestoreState: (value: unknown) => void
}

export function useBackToClose(
  onClose: () => void,
  { enabled = true, adoptCurrentEntry = false }: UseBackToCloseOptions = {}
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

    if (!pushedRef.current) {
      // COMING BACK to an entry this overlay left behind: take it over
      // rather than pushing a second one. Its id and depth are the ones it
      // had before, so the stack, the depth arithmetic and requestClose all
      // behave as though it had never been away — and the id comes off the
      // suspended list, because it is no longer outstanding.
      const adopted = adoptCurrentEntry ? overlayStateOf(window.history.state) : null

      if (adopted) {
        idRef.current = adopted.id
        depthRef.current = adopted.depth
        suspendedIds.delete(adopted.id)
        // Re-entering an overlay: the page's entry goes manual again, the
        // same as it would for a fresh push.
        if (openOverlays.length === 0) takeScrollRestoration()
      } else {
        if (idRef.current === null) idRef.current = nextOverlayId++
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
          { [OVERLAY_STATE_KEY]: { id: idRef.current, depth: depthRef.current } },
          ""
        )
      }
      pushedRef.current = true
    }

    if (idRef.current === null) idRef.current = nextOverlayId++
    const id = idRef.current
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
      // SUSPENDED: this unmount is the route change navigateKeeping asked
      // for, and the entry underneath the new route is the thing the reader
      // comes back to. It is outstanding on purpose, so the orphan check —
      // which exists for an overlay that really did vanish — must not run
      // for it and pop the entry out from under the navigation.
      if (suspendedIds.has(id)) return
      orphanCheckRef.current = window.setTimeout(() => {
        orphanCheckRef.current = null
        pushedRef.current = false
        popOrphanEntries()
      }, 0)
    }
  }, [enabled, adoptCurrentEntry])

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

  /**
   * Leave, and keep the entry. No pop, no close callback — see the type.
   *
   * scrollRestoration goes back to what it was before the push for the same
   * reason navigateAway restores it: the entry the browser is about to push
   * the destination onto inherits the mode, and back from the destination
   * has to restore its scroll position the ordinary way.
   */
  const navigateKeeping = useCallback((href: string) => {
    const id = idRef.current
    if (id !== null && pushedRef.current) suspendedIds.add(id)
    restoreScrollRestoration()
    router.push(href)
  }, [router])

  const setRestoreState = useCallback((value: unknown) => {
    const id = idRef.current
    if (!enabled || id === null || typeof window === "undefined") return
    const current = overlayStateOf(window.history.state)
    // Only ever OUR entry: with a sheet open on top of us the current entry
    // is the sheet's, and writing this overlay's position onto it would put
    // the payload on the wrong entry entirely.
    if (!current || current.id !== id) return
    window.history.replaceState(
      {
        // Spread first: the entry already carries Next's own route state,
        // and replacing it wholesale would make a back press onto this
        // entry a full page reload.
        ...(window.history.state as Record<string, unknown>),
        [OVERLAY_STATE_KEY]: { ...current, restore: value },
      },
      ""
    )
  }, [enabled])

  return { requestClose, navigateAway, navigateKeeping, setRestoreState }
}
