"use client"

/**
 * useDoubleTap — the viewer's tap timing, shared by the media slide and the
 * text card so both like on exactly the same gesture.
 *
 * A single tap is held back DOUBLE_TAP_MS so a double-tap can be a like
 * without the first tap also pausing the video; a second tap inside the
 * window cancels the held one and fires the double. The returned handler
 * takes no event: what counts as a tap (not a button, not a link) is the
 * caller's call, made before it is invoked.
 */

import { useCallback, useEffect, useRef } from "react"

/** A second tap inside this window is a double-tap, not two taps. */
export const DOUBLE_TAP_MS = 250

export function useDoubleTap({
  onDoubleTap,
  onSingleTap,
}: {
  onDoubleTap: () => void
  /** Fires once the window has passed with no second tap. */
  onSingleTap?: () => void
}): () => void {
  const timer = useRef<number | null>(null)
  // Latest callbacks, so the handler itself never changes identity and a
  // held single tap runs whatever the caller wants NOW, not at tap time.
  const onDoubleTapRef = useRef(onDoubleTap)
  const onSingleTapRef = useRef(onSingleTap)
  useEffect(() => {
    onDoubleTapRef.current = onDoubleTap
    onSingleTapRef.current = onSingleTap
  })

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  return useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
      onDoubleTapRef.current()
      return
    }
    timer.current = window.setTimeout(() => {
      timer.current = null
      onSingleTapRef.current?.()
    }, DOUBLE_TAP_MS)
  }, [])
}
