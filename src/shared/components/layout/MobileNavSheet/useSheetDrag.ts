"use client"

/**
 * useSheetDrag — the expand-up gesture for the nav dock, in one place.
 *
 * What moves is the dock's BODY: the panel that lives directly above the tab
 * bar inside the same fixed container. Collapsed it is translated down by
 * exactly its own height, which parks it behind the bar; expanded it sits on
 * top of the bar, which is the sheet's footer. The travel distance is
 * therefore the body's measured height, kept current by a ResizeObserver
 * because the body grows and shrinks (the account list expands inside it).
 *
 * The body opens AND closes under the finger. Both directions are the same
 * engine, so the feel is identical either way:
 *
 *  - An OPEN drag starts anywhere in the dock's drag region (the tab bar,
 *    marked with `data-nav-drag-region`). The listener is on the document in
 *    the capture phase rather than on the bar itself, so a drag that starts
 *    on one of the five tabs is still ours — the click it would have fired is
 *    swallowed on claim. The attribute — not the pointer's coordinates —
 *    decides: a geometric "bottom 90px of the screen" test would also claim
 *    drags on any other overlay's footer.
 *  - A CLOSE drag starts on the sheet's own handle, or on its scroll area when
 *    that is already scrolled to the top (the standard sheet rule: at the top
 *    of the list, down closes; anywhere else, down scrolls).
 *
 * While a drag is live the position is written straight to the element's
 * `style.transform` — no React state per frame, so a 60fps drag costs zero
 * renders. React state only flips at the three moments that change what the
 * sheet IS: claimed, settling, settled.
 *
 * On release the sheet animates to the snapped position with --ease-spring and
 * the inline transform is then REMOVED, so the resting state is owned by CSS
 * and nothing is left overriding it.
 *
 * prefers-reduced-motion: no drag at all. Nothing is claimed, so a swipe is
 * just a swipe and the sheet opens only from a tap, instantly.
 */

import { useCallback, useEffect, useRef, useState } from "react"

/** Mark the bottom chrome with this so an upward drag on it opens the sheet. */
export const NAV_DRAG_REGION_ATTR = "data-nav-drag-region"

/** Movement before a gesture is a drag rather than a tap. */
const CLAIM_PX = 8
/** How much more horizontal than vertical abandons the gesture (a swipe-back). */
const AXIS_BIAS = 1.2
/** Fraction of the sheet that must be travelled for a slow drag to snap over. */
const SNAP_FRACTION = 0.4
/** px/ms past which a flick wins regardless of distance. */
const FLICK_VELOCITY = 0.5
/** Resistance past fully-open: the most the sheet will lift off the bottom. */
const OVERSHOOT_MAX = 12
const OVERSHOOT_FACTOR = 0.12
/** Settle animation; the fallback cleanup runs a little after it. */
const SETTLE_MS = 320
const SETTLE_CLEANUP_MS = SETTLE_MS + 80
/** Velocity is measured over the tail of the gesture, not all of it. */
const SAMPLE_WINDOW_MS = 120

type DragMode = "open" | "close"

type Drag = {
  pointerId: number
  mode: DragMode
  startX: number
  startY: number
  /** Sheet height at gesture start — the full travel distance. */
  height: number
  /** True once this is a drag; before that the tap/click must still work. */
  claimed: boolean
  /** Close drags that began on the scroll area, which must be at its top. */
  fromScroll: boolean
  samples: { t: number; y: number }[]
}

export interface SheetDrag {
  /** The panel that moves. Its height is the gesture's travel distance. */
  bodyRef: React.RefObject<HTMLDivElement | null>
  backdropRef: React.RefObject<HTMLDivElement | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** True while a finger owns the sheet — CSS drops transitions on this. */
  dragging: boolean
  /** True during the release animation, until the inline transform is cleared. */
  settling: boolean
  /** Spread on the sheet's handle and on its scroll area. */
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  /** The body's current height in px — 0 before it has been measured. */
  bodyHeight: number
}

export function useSheetDrag({
  open,
  onOpen,
  onClose,
  reducedMotion,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  reducedMotion: boolean
}): SheetDrag {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)

  const dragRef = useRef<Drag | null>(null)
  const settleTimer = useRef<number | null>(null)

  // The travel distance. Measured rather than assumed: the body's height
  // changes when the account list expands or a role has more tiles, and a
  // stale number would make the drag undershoot or overshoot. Kept in a ref
  // for the document listeners AND in state for the hint's bounce, which
  // needs a render to apply it.
  const [bodyHeight, setBodyHeight] = useState(0)
  const bodyHeightRef = useRef(0)

  useEffect(() => {
    const body = bodyRef.current
    if (!body || typeof ResizeObserver === "undefined") return

    const measure = () => {
      const next = body.offsetHeight
      if (next === bodyHeightRef.current) return
      bodyHeightRef.current = next
      setBodyHeight(next)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  /** Travel for a gesture starting now: the live measurement, or a fresh read. */
  const travel = useCallback(() => {
    const measured = bodyHeightRef.current
    if (measured > 0) return measured
    return bodyRef.current?.offsetHeight ?? 0
  }, [])

  // Callbacks and flags the document listeners read: kept in refs so the
  // listeners are attached once rather than re-bound on every parent render.
  const openRef = useRef(open)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const reducedRef = useRef(reducedMotion)
  useEffect(() => {
    openRef.current = open
    onOpenRef.current = onOpen
    onCloseRef.current = onClose
    reducedRef.current = reducedMotion
  })

  /** Write the sheet's position, and the backdrop's opacity to match. */
  const paint = useCallback((translate: number, height: number) => {
    const body = bodyRef.current
    if (body) body.style.transform = `translateY(${translate}px)`
    const backdrop = backdropRef.current
    if (backdrop && height > 0) {
      const shown = 1 - Math.min(1, Math.max(0, translate / height))
      backdrop.style.opacity = String(shown)
    }
  }, [])

  /** Drop every inline style so the resting state is CSS's again. */
  const clearInline = useCallback(() => {
    const body = bodyRef.current
    if (body) {
      body.style.transform = ""
      body.style.transition = ""
      body.style.willChange = ""
    }
    const backdrop = backdropRef.current
    if (backdrop) {
      backdrop.style.opacity = ""
      backdrop.style.transition = ""
    }
  }, [])

  // A claimed drag must not also scroll the page or bounce the scroller: the
  // only way to stop that on iOS is a non-passive touchmove that cancels it.
  // Added for the life of the gesture only — useBodyScrollLock's own listener
  // lets ours through because the handle carries `data-allow-touchmove`.
  const blockTouch = useCallback((event: TouchEvent) => {
    if (event.cancelable) event.preventDefault()
  }, [])

  /** Swallow the click a claimed drag would otherwise fire on a nav tab. */
  const swallowNextClick = useCallback(() => {
    const swallow = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener("click", swallow, { capture: true, once: true })
    // Nothing to swallow if the pointer sequence ended without a click.
    window.setTimeout(() => {
      document.removeEventListener("click", swallow, { capture: true })
    }, 400)
  }, [])

  const settleTo = useCallback(
    (target: number, height: number, toOpen: boolean) => {
      const body = bodyRef.current
      document.removeEventListener("touchmove", blockTouch)

      // Commit the state change NOW, at the start of the animation, so the
      // scroll lock and the back-button entry are in place for the whole of
      // it rather than 320ms late.
      if (toOpen) onOpenRef.current()
      else onCloseRef.current()

      if (!body || reducedRef.current) {
        clearInline()
        setSettling(false)
        return
      }

      setSettling(true)
      body.style.transition = `transform ${SETTLE_MS}ms var(--ease-spring)`
      body.style.willChange = "transform"
      const backdrop = backdropRef.current
      if (backdrop) backdrop.style.transition = `opacity ${SETTLE_MS}ms var(--ease-out)`
      // Flush the pre-transition position, or the browser folds both writes
      // into one frame and the sheet jumps instead of animating.
      void body.offsetHeight
      paint(target, height)

      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null
        clearInline()
        setSettling(false)
      }, SETTLE_CLEANUP_MS)
    },
    [blockTouch, clearInline, paint]
  )

  // ── The gesture itself ────────────────────────────────────────────────────
  // One effect owns every listener. `pointermove`/`pointerup` go on the
  // document so a finger that leaves the sheet (or the bar) still drives it.
  useEffect(() => {
    /** Resisted translate: past fully-open it barely moves, and never gaps. */
    const resist = (translate: number) =>
      translate >= 0 ? translate : -Math.min(OVERSHOOT_MAX, -translate * OVERSHOOT_FACTOR)

    const end = () => {
      document.removeEventListener("touchmove", blockTouch)
      dragRef.current = null
      setDragging(false)
    }

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      const dy = event.clientY - drag.startY
      const dx = event.clientX - drag.startX

      if (!drag.claimed) {
        // A mostly-horizontal gesture is someone else's (a carousel, the
        // browser's own back swipe) — let go of it entirely.
        if (Math.abs(dx) > Math.abs(dy) * AXIS_BIAS) {
          dragRef.current = null
          return
        }
        if (Math.abs(dy) < CLAIM_PX) return
        // Only the direction that makes sense for this mode claims.
        if (drag.mode === "open" ? dy >= 0 : dy <= 0) {
          dragRef.current = null
          return
        }
        drag.claimed = true
        setDragging(true)
        // A drag that starts while the last release is still settling has to
        // take the sheet over cleanly: the pending transition would otherwise
        // lag this one behind the finger, and the pending cleanup would wipe
        // its transform out from under it.
        if (settleTimer.current !== null) {
          window.clearTimeout(settleTimer.current)
          settleTimer.current = null
        }
        setSettling(false)
        const body = bodyRef.current
        if (body) body.style.transition = "none"
        const backdrop = backdropRef.current
        if (backdrop) backdrop.style.transition = "none"
        swallowNextClick()
        document.addEventListener("touchmove", blockTouch, { passive: false })
      }

      drag.samples.push({ t: event.timeStamp, y: event.clientY })
      if (drag.samples.length > 6) drag.samples.shift()

      const base = drag.mode === "open" ? drag.height : 0
      paint(resist(Math.min(drag.height, base + dy)), drag.height)
    }

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      if (!drag.claimed) {
        // Never became a drag: it was a tap, and the link it was on handles it.
        dragRef.current = null
        return
      }

      const dy = event.clientY - drag.startY
      const base = drag.mode === "open" ? drag.height : 0
      const translate = Math.max(0, Math.min(drag.height, base + dy))
      /** 1 = fully open, 0 = fully closed. */
      const progress = drag.height > 0 ? 1 - translate / drag.height : 0

      // Velocity over the tail of the gesture: negative is upward.
      const recent = drag.samples.filter((s) => event.timeStamp - s.t <= SAMPLE_WINDOW_MS)
      const first = recent[0]
      const elapsed = first ? event.timeStamp - first.t : 0
      const velocity = first && elapsed > 0 ? (event.clientY - first.y) / elapsed : 0

      const toOpen =
        velocity < -FLICK_VELOCITY
          ? true
          : velocity > FLICK_VELOCITY
            ? false
            : drag.mode === "open"
              ? progress > SNAP_FRACTION
              : progress > 1 - SNAP_FRACTION

      const height = drag.height
      end()
      settleTo(toOpen ? 0 : height, height, toOpen)
    }

    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const height = drag.height
      const wasClaimed = drag.claimed
      const mode = drag.mode
      end()
      // A cancelled drag goes back where it came from rather than snapping.
      if (wasClaimed) settleTo(mode === "open" ? height : 0, height, mode !== "open")
    }

    // Capture phase: the bar's tabs are links, and a drag that starts on one
    // must still be ours. The click they would fire is swallowed on claim.
    const onDocPointerDown = (event: PointerEvent) => {
      if (openRef.current || reducedRef.current) return
      if (dragRef.current) return
      if (event.pointerType === "mouse" && event.button !== 0) return

      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest(`[${NAV_DRAG_REGION_ATTR}]`)) return

      const height = travel()
      if (height <= 0) return // desktop (display: none) — nothing to drag

      dragRef.current = {
        pointerId: event.pointerId,
        mode: "open",
        startX: event.clientX,
        startY: event.clientY,
        height,
        claimed: false,
        fromScroll: false,
        samples: [{ t: event.timeStamp, y: event.clientY }],
      }
    }

    document.addEventListener("pointerdown", onDocPointerDown, true)
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("pointercancel", onPointerCancel)

    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true)
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("pointercancel", onPointerCancel)
      document.removeEventListener("touchmove", blockTouch)
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [blockTouch, paint, settleTo, swallowNextClick, travel])

  /**
   * Close drags, from the sheet's handle or its scroll area. React's own
   * handler here rather than the document listener above: these elements are
   * the sheet's, so there is nothing to hit-test.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!openRef.current || reducedRef.current) return
      if (dragRef.current) return
      if (event.pointerType === "mouse" && event.button !== 0) return

      const scroller = scrollRef.current
      const fromScroll = !!scroller && scroller.contains(event.target as Node)
      // Mid-list, down scrolls the list; only at the very top does it close.
      if (fromScroll && scroller.scrollTop > 0) return

      const height = travel()
      if (height <= 0) return

      dragRef.current = {
        pointerId: event.pointerId,
        mode: "close",
        startX: event.clientX,
        startY: event.clientY,
        height,
        claimed: false,
        fromScroll,
        samples: [{ t: event.timeStamp, y: event.clientY }],
      }
    },
    [travel]
  )

  // Opened or closed by a tap (or by the back button): whatever a half-drag
  // left behind must go, or the inline transform would pin the sheet.
  useEffect(() => {
    if (dragRef.current?.claimed) return
    if (settleTimer.current !== null) return
    clearInline()
  }, [open, clearInline])

  return { bodyRef, backdropRef, scrollRef, dragging, settling, onPointerDown, bodyHeight }
}
