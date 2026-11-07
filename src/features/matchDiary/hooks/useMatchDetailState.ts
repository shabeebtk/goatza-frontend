"use client"

/**
 * Which match the detail modal is reading, for the two places that open it.
 *
 * The object the card was tapped with is kept as a snapshot, and the live row
 * from the list wins whenever it is there. So an edit saved in the sheet shows
 * straight away, and the modal survives the moments the row is missing from the
 * list: useDeleteMatch pulls it out optimistically, and a fixture promoted to
 * played sits between two lists while they refetch.
 *
 * When the row is gone and nothing explains it (the edit moved it out of the
 * current filter, or another tab deleted it) the modal closes rather than keep
 * showing a match that is no longer there.
 */

import { useCallback, useEffect, useState } from "react"

import type { MatchEntry } from "../types"

export function useMatchDetailState(
    entries: MatchEntry[],
    /** The list is mid-change: the sheet is open, or a refetch is in flight. */
    settling: boolean
) {
    const [snapshot, setSnapshot] = useState<MatchEntry | null>(null)
    const [deleting, setDeleting] = useState(false)

    const fresh = snapshot
        ? (entries.find((entry) => entry.id === snapshot.id) ?? null)
        : null

    useEffect(() => {
        if (!snapshot || fresh || deleting || settling) return

        /* The lint rule guards against an effect that cascades. This one
           cannot: the render it schedules has no snapshot, which returns on
           the first line above. */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSnapshot(null)
    }, [snapshot, fresh, deleting, settling])

    const close = useCallback(() => {
        setSnapshot(null)
        setDeleting(false)
    }, [])

    return {
        entry: fresh ?? snapshot,
        open: setSnapshot,
        close,
        setDeleting,
    }
}
