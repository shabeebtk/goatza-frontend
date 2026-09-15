"use client"

/**
 * useZoomPan — pinch / scroll / double-tap zoom with drag-to-pan, for one
 * image inside a fixed container.
 *
 * Lifted from MediaCarousel's lightbox so the full-screen post viewer gets the
 * same feel without a second copy of the maths. What changed on the way out:
 *
 * - `wheel` and `touchmove` are attached NATIVELY with `{ passive: false }`.
 *   React registers both as passive, so the lightbox's `e.preventDefault()`
 *   calls never did anything — a pinch zoomed the image and the page.
 * - `wheelMode: "ctrl-zoom"` zooms only while Ctrl/⌘ is held — which is what a
 *   trackpad pinch sends in Chrome, Edge and Firefox — and lets a plain wheel
 *   through, so the desktop viewer can keep scrolling its comments panel.
 * - Desktop Safari sends `gesturestart` / `gesturechange` for a trackpad pinch
 *   instead of Ctrl+wheel. Handled, and default-prevented so the page does not
 *   zoom underneath.
 *
 * Nothing here stops propagation: a viewer that swipes between posts on an
 * ancestor should consult `isZoomed` instead, so a pan never reads as a swipe.
 *
 * Wire-up:
 *   const zoom = useZoomPan({ enabled: isImage })
 *   <div {...zoom.containerProps} style={{ cursor: zoom.cursor }}>
 *     <img ref={zoom.attachMedia} style={zoom.mediaStyle} draggable={false} />
 *   </div>
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react"

export type WheelMode = "zoom" | "ctrl-zoom"

export interface UseZoomPanOptions {
  /** False on a video slide: every gesture is ignored and the style is identity. */
  enabled?: boolean
  /** "zoom" — every wheel event zooms (the lightbox). "ctrl-zoom" — only with Ctrl/⌘. */
  wheelMode?: WheelMode
  maxScale?: number
  /** Where a double-tap / double-click lands. */
  doubleTapScale?: number
  /**
   * False when the host uses double-tap for something else (the post viewer
   * likes on it). Pinch, wheel and drag still work.
   */
  doubleTapZoom?: boolean
  /**
   * Snap back to 1× when the fingers lift — the phone viewer's "peek" zoom,
   * where a zoomed image would otherwise fight the swipe between slides.
   */
  snapBack?: boolean
}

/** Two taps closer than this are a double-tap. */
const DOUBLE_TAP_MS = 280

/** Per-notch step for a real mouse wheel — the lightbox's value. */
const WHEEL_STEP = 0.15

/** Keyboard +/- step. */
const KEY_STEP = 0.5

/** Safari `GestureEvent` carries the pinch ratio; it is not in lib.dom. */
type GestureEventLike = Event & { scale: number }

export function useZoomPan({
  enabled = true,
  wheelMode = "zoom",
  maxScale = 4,
  doubleTapScale = 2.5,
  doubleTapZoom = true,
  snapBack = false,
}: UseZoomPanOptions = {}) {
  const [scale, setScaleState] = useState(1)
  const [offset, setOffsetState] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDraggingState] = useState(false)

  // Mirrors of the state above for the NATIVE listeners, which are attached
  // once per container and must not close over a stale render.
  const scaleRef = useRef(1)
  const draggingRef = useRef(false)
  const enabledRef = useRef(enabled)
  const wheelModeRef = useRef(wheelMode)
  useEffect(() => {
    enabledRef.current = enabled
    wheelModeRef.current = wheelMode
  }, [enabled, wheelMode])

  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const lastTap = useRef(0)
  const lastPinchDist = useRef<number | null>(null)
  // Safari pinch: the scale the gesture started from, and a flag so the wheel
  // events Safari may also emit during it are not applied twice.
  const gestureStartScale = useRef<number | null>(null)

  // The image the transform applies to — measured for the pan bounds. Handed
  // out as a callback ref, so the host passes a function rather than reading a
  // ref object in render.
  const mediaElRef = useRef<HTMLImageElement | null>(null)
  const attachMedia = useCallback((el: HTMLImageElement | null) => {
    mediaElRef.current = el
  }, [])
  // State, not a ref: the native listeners are (re)attached when the container
  // mounts, which a plain ref would not signal.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  const setOffset = useCallback((next: { x: number; y: number }) => {
    setOffsetState(next)
  }, [])

  /** Clamps into [1, maxScale]; reaching 1 also recentres, as every path did. */
  const setScale = useCallback(
    (next: number | ((current: number) => number)) => {
      const raw = typeof next === "function" ? next(scaleRef.current) : next
      const clamped = Math.max(1, Math.min(maxScale, raw))
      scaleRef.current = clamped
      setScaleState(clamped)
      if (clamped === 1) setOffset({ x: 0, y: 0 })
    },
    [maxScale, setOffset]
  )

  const setIsDragging = useCallback((next: boolean) => {
    draggingRef.current = next
    setIsDraggingState(next)
  }, [])

  const resetZoom = useCallback(() => {
    setScale(1)
  }, [setScale])

  /** Keyboard +/-: step the scale. */
  const zoomBy = useCallback(
    (direction: 1 | -1) => setScale((s) => s + direction * KEY_STEP),
    [setScale]
  )

  // Clamp offset so the image doesn't pan beyond its edges.
  const clampOffset = useCallback(
    (ox: number, oy: number, currentScale: number) => {
      const el = mediaElRef.current
      if (!el) return { x: ox, y: oy }
      const maxX = (el.offsetWidth * (currentScale - 1)) / 2
      const maxY = (el.offsetHeight * (currentScale - 1)) / 2
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      }
    },
    []
  )

  // ── Native listeners: wheel, touchmove, Safari gestures ──────────
  useEffect(() => {
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current) return
      if (gestureStartScale.current !== null) {
        e.preventDefault()
        return
      }
      // A trackpad pinch arrives as Ctrl+wheel (⌘ on some Mac setups).
      const isPinch = e.ctrlKey || e.metaKey
      if (wheelModeRef.current === "ctrl-zoom" && !isPinch) return

      e.preventDefault()
      if (isPinch) {
        // Pinch deltas are small and frequent; scale proportionally so the
        // image tracks the fingers rather than jumping a fixed step per event.
        setScale((s) => s * Math.exp(-e.deltaY * 0.01))
      } else {
        setScale((s) => s + (e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP))
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return

      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        const delta = dist / lastPinchDist.current
        lastPinchDist.current = dist
        setScale((s) => s * delta)
      } else if (e.touches.length === 1 && draggingRef.current) {
        e.preventDefault()
        const dx = e.touches[0].clientX - dragStart.current.x
        const dy = e.touches[0].clientY - dragStart.current.y
        setOffset(
          clampOffset(
            dragStart.current.ox + dx,
            dragStart.current.oy + dy,
            scaleRef.current
          )
        )
      }
    }

    const onGestureStart = (e: Event) => {
      if (!enabledRef.current) return
      e.preventDefault()
      gestureStartScale.current = scaleRef.current
    }
    const onGestureChange = (e: Event) => {
      if (!enabledRef.current || gestureStartScale.current === null) return
      e.preventDefault()
      setScale(gestureStartScale.current * (e as GestureEventLike).scale)
    }
    const onGestureEnd = (e: Event) => {
      e.preventDefault()
      gestureStartScale.current = null
    }

    const opts: AddEventListenerOptions = { passive: false }
    container.addEventListener("wheel", onWheel, opts)
    container.addEventListener("touchmove", onTouchMove, opts)
    container.addEventListener("gesturestart", onGestureStart, opts)
    container.addEventListener("gesturechange", onGestureChange, opts)
    container.addEventListener("gestureend", onGestureEnd, opts)
    return () => {
      container.removeEventListener("wheel", onWheel)
      container.removeEventListener("touchmove", onTouchMove)
      container.removeEventListener("gesturestart", onGestureStart)
      container.removeEventListener("gesturechange", onGestureChange)
      container.removeEventListener("gestureend", onGestureEnd)
    }
  }, [container, clampOffset, setOffset, setScale])

  // ── React handlers (nothing here needs preventDefault on a passive event) ──
  const isZoomed = scale > 1

  const onDoubleClick = useCallback(
    (e: ReactMouseEvent) => {
      if (!enabled || !doubleTapZoom) return
      e.stopPropagation()
      if (isZoomed) {
        resetZoom()
      } else {
        // Zoom into the clicked point
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        const clamped = clampOffset(
          -cx * (doubleTapScale - 1),
          -cy * (doubleTapScale - 1),
          doubleTapScale
        )
        setScale(doubleTapScale)
        setOffset(clamped)
      }
    },
    [enabled, doubleTapZoom, isZoomed, resetZoom, clampOffset, doubleTapScale, setScale, setOffset]
  )

  const onMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (!isZoomed || !enabled) return
      e.preventDefault()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    },
    [isZoomed, enabled, offset, setIsDragging]
  )

  const onMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!isDragging) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
    },
    [isDragging, scale, clampOffset, setOffset]
  )

  const onMouseUp = useCallback(() => setIsDragging(false), [setIsDragging])

  const onTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (!enabled) return
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist.current = Math.hypot(dx, dy)
      } else if (e.touches.length === 1) {
        // Double-tap detection
        const now = Date.now()
        if (doubleTapZoom && now - lastTap.current < DOUBLE_TAP_MS) {
          if (isZoomed) resetZoom()
          else setScale(doubleTapScale)
        }
        lastTap.current = now

        if (isZoomed) {
          dragStart.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            ox: offset.x,
            oy: offset.y,
          }
          setIsDragging(true)
        }
      }
    },
    [enabled, doubleTapZoom, isZoomed, resetZoom, offset, doubleTapScale, setScale, setIsDragging]
  )

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      lastPinchDist.current = null
      setIsDragging(false)
      // Last finger up → let go of the zoom.
      if (snapBack && e.touches.length === 0) resetZoom()
    },
    [snapBack, resetZoom, setIsDragging]
  )

  const mediaStyle = useMemo<CSSProperties>(
    () => ({
      transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
      transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.22,1,0.36,1)",
      transformOrigin: "center center",
      willChange: "transform",
      userSelect: "none",
      WebkitUserSelect: "none",
      touchAction: isZoomed ? "none" : "auto",
    }),
    [scale, offset.x, offset.y, isDragging, isZoomed]
  )

  const cursor = !enabled
    ? "default"
    : isZoomed
      ? isDragging
        ? "grabbing"
        : "grab"
      : "zoom-in"

  const containerProps = useMemo(
    () => ({
      ref: setContainer,
      onDoubleClick,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave: onMouseUp,
      onTouchStart,
      onTouchEnd,
    }),
    [onDoubleClick, onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchEnd]
  )

  return {
    scale,
    offset,
    isZoomed,
    isDragging,
    resetZoom,
    zoomBy,
    /** Spread onto the element that receives the gestures. */
    containerProps,
    /** Callback ref for the <img> the transform applies to. */
    attachMedia,
    mediaStyle,
    cursor,
  }
}
