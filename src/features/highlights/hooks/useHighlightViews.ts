/**
 * useHighlightViews — the viewer's fire-and-forget view counter.
 *
 * One view per clip per browser session: the set of already-counted ids lives at
 * module scope, so re-opening the viewer (or opening it from another surface)
 * doesn't re-count what this person already watched. The server independently
 * refuses to count the owner's own views; we skip sending them at all.
 *
 * Debounced, because swiping through a rail should not fire a request per clip
 * the eye barely landed on — only clips that stayed on screen count.
 */

import { useCallback, useEffect, useRef } from "react"

import { recordHighlightViewApi } from "../services/highlights.api"

/** Counted clip ids for this page session (cleared on reload). */
const countedIds = new Set<string>()

const DEBOUNCE_MS = 800

export function useHighlightViews(options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? true

    const timerRef = useRef<number | null>(null)
    const enabledRef = useRef(enabled)

    useEffect(() => {
        enabledRef.current = enabled
    }, [enabled])

    const clearPending = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    useEffect(() => () => clearPending(), [clearPending])

    /**
     * Count `highlightId` if it is still on screen when the debounce elapses.
     * Calling it again for another clip cancels the previous pending count.
     */
    const markViewed = useCallback(
        (highlightId: string) => {
            clearPending()

            if (!enabledRef.current) return
            if (!highlightId || countedIds.has(highlightId)) return

            timerRef.current = window.setTimeout(() => {
                timerRef.current = null
                if (!enabledRef.current || countedIds.has(highlightId)) return

                // Optimistically mark it: a failed count is not worth retrying,
                // and never worth a second request or a toast.
                countedIds.add(highlightId)
                void recordHighlightViewApi(highlightId).catch(() => {
                    countedIds.delete(highlightId)
                })
            }, DEBOUNCE_MS)
        },
        [clearPending]
    )

    return { markViewed, cancelPendingView: clearPending }
}
