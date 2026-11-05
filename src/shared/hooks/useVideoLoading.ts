"use client"

/**
 * useVideoLoading — is this video something the reader is waiting for?
 *
 * The one rule behind the spinner on the feed tile and in the viewer, so the two
 * cannot drift apart:
 *
 *     wanted && (no frame painted yet || buffering)
 *
 * `wanted` and `hasFrame` are the caller's: only it knows whether this element
 * is meant to be playing, and it already tracks the first frame (whenFirstFrame).
 *
 * Buffering starts on `waiting` once a frame has been shown (before that, "no
 * frame yet" already says it), and on `stalled` if the clock has not moved. It
 * ends on `playing`, `canplaythrough` or a `timeupdate` that really moved the
 * clock: `timeupdate` also fires as playback stops. `pause` and `ended` end it
 * too, and so does `error`, which also stops the wait for a first frame. A clip
 * that failed is not loading: it stays on its thumbnail with nothing spinning.
 */

import { useEffect, useRef, useState, type RefObject } from "react"

/**
 * `stalled` only says the download went quiet, which is fine while the buffer
 * lasts. The clock not moving for this long is what makes it the reader's wait.
 */
const STALL_CHECK_MS = 300

export function useVideoLoading(
    videoRef: RefObject<HTMLVideoElement | null>,
    { wanted, hasFrame }: { wanted: boolean; hasFrame: boolean }
): boolean {
    const [buffering, setBuffering] = useState(false)
    const [halted, setHalted] = useState(false)

    // Read inside the media listeners, which live as long as the element.
    const hasFrameRef = useRef(hasFrame)
    useEffect(() => {
        hasFrameRef.current = hasFrame
    }, [hasFrame])

    useEffect(() => {
        const el = videoRef.current
        if (!el) return

        let lastTime = el.currentTime
        let stallTimer: ReturnType<typeof setTimeout> | null = null

        const clearStallCheck = () => {
            if (stallTimer !== null) clearTimeout(stallTimer)
            stallTimer = null
        }
        const endBuffering = () => {
            clearStallCheck()
            setBuffering(false)
        }

        const onWaiting = () => {
            lastTime = el.currentTime
            if (hasFrameRef.current) setBuffering(true)
        }
        const onStalled = () => {
            if (stallTimer !== null || !hasFrameRef.current || el.paused) return
            const stalledAt = el.currentTime
            stallTimer = setTimeout(() => {
                stallTimer = null
                if (!el.paused && el.currentTime === stalledAt) setBuffering(true)
            }, STALL_CHECK_MS)
        }
        const onTimeUpdate = () => {
            if (el.currentTime === lastTime) return
            lastTime = el.currentTime
            endBuffering()
        }
        const onPlaying = () => {
            setHalted(false)
            endBuffering()
        }
        const onHalted = () => {
            setHalted(true)
            endBuffering()
        }
        // A new source: whatever happened to the last one is over.
        const onNewSource = () => {
            lastTime = el.currentTime
            setHalted(false)
            endBuffering()
        }

        const listeners: Array<[keyof HTMLMediaElementEventMap, () => void]> = [
            ["waiting", onWaiting],
            ["stalled", onStalled],
            ["timeupdate", onTimeUpdate],
            ["playing", onPlaying],
            ["canplaythrough", endBuffering],
            ["pause", endBuffering],
            ["ended", onHalted],
            ["error", onHalted],
            ["loadstart", onNewSource],
            ["emptied", onNewSource],
        ]
        for (const [type, listener] of listeners) el.addEventListener(type, listener)

        return () => {
            clearStallCheck()
            for (const [type, listener] of listeners) el.removeEventListener(type, listener)
        }
    }, [videoRef])

    return wanted && !halted && (!hasFrame || buffering)
}
