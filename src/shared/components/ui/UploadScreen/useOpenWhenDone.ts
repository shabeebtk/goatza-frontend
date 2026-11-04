"use client"

/**
 * useOpenWhenDone — what happens when a task finishes in front of its author.
 *
 * Only UploadScreen uses it, so it only runs while the screen is EXPANDED on
 * that task. A task that finishes while minimized never gets here: the pill
 * says "Posted · View" and nobody is pulled off the page they are reading.
 *
 *   1. the done state, ~700 ms;
 *   2. "Opening your posts…";
 *   3. the list refetch the queue already started, 2 s at most, so the new
 *      post is there when the page appears;
 *   4. navigate — unless already on that path;
 *   5. close once the pathname matches, or after 3 s.
 *
 * Minimizing at any point before step 4 unmounts this and cancels the rest.
 * If the active account is not the one the task was posted as, or there is
 * nowhere to go, it says "Posted" and minimizes. A server-processed task comes
 * through the same way, whenever realtime or the poll finishes it.
 *
 * Step 5 can land in a DIFFERENT instance of this hook: going from /home to
 * /profile/x/posts changes route group, and so unmounts one AppShell and
 * mounts another. `opening` in the store is how the new one knows to wait for
 * the pathname rather than start again.
 */

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
    dismissUpload,
    minimizeUploadView,
    useActorKey,
    waitForListRefresh,
} from "@/shared/upload/uploadQueue"
import {
    useUploadQueueStore,
    type QueueTask,
    type QueueTaskDestination,
} from "@/store/uploadQueue.store"

const DONE_HOLD_MS = 700
/** Nothing follows this "Posted", so it stays long enough to be read. */
const DONE_ONLY_HOLD_MS = 1500
const REFRESH_MAX_MS = 2000
const ARRIVE_MAX_MS = 3000

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type OpenWhenDonePhase = "idle" | "done" | "opening"

export function useOpenWhenDone({
    task,
    destination,
    navigateAway,
}: {
    task: QueueTask
    destination: QueueTaskDestination | null
    /** Pops this overlay's history entry, then pushes. */
    navigateAway: (href: string) => void
}): OpenWhenDonePhase {
    const pathname = usePathname()
    const activeActorKey = useActorKey()
    const leavingTo = useUploadQueueStore((s) =>
        s.opening?.taskId === task.id ? s.opening.href : null
    )
    const [opening, setOpening] = useState(false)

    const isDone = task.status === "done"
    const taskId = task.id
    const kind = task.kind

    // What the flow reads when it gets there. Not dependencies: a re-render
    // (navigateAway is a new function when the router changes, the pathname
    // moves on arrival) must not restart it.
    const latest = useRef({
        pathname,
        navigateAway,
        href: destination?.href ?? null,
        sameAccount: activeActorKey === task.actorKey,
    })
    useEffect(() => {
        latest.current = {
            pathname,
            navigateAway,
            href: destination?.href ?? null,
            sameAccount: activeActorKey === task.actorKey,
        }
    })

    useEffect(() => {
        if (!isDone) return
        // A screen that mounted mid-flight: the one before it already went.
        if (useUploadQueueStore.getState().opening?.taskId === taskId) return

        let cancelled = false

        const run = async () => {
            const { href, sameAccount } = latest.current
            if (!sameAccount || !href) {
                await delay(DONE_ONLY_HOLD_MS)
                if (!cancelled) minimizeUploadView()
                return
            }

            await delay(DONE_HOLD_MS)
            if (cancelled) return
            setOpening(true)

            await waitForListRefresh(kind, REFRESH_MAX_MS)
            if (cancelled) return

            if (latest.current.pathname === href) {
                // Already there, and the new post is at the top of it.
                window.scrollTo(0, 0)
                dismissUpload(taskId)
                return
            }
            useUploadQueueStore.getState().setOpening({ taskId, href })
            latest.current.navigateAway(href)
        }

        void run()
        return () => {
            cancelled = true
        }
    }, [isDone, kind, taskId])

    useEffect(() => {
        if (!leavingTo) return
        if (pathname === leavingTo) {
            dismissUpload(taskId)
            return
        }
        const timer = setTimeout(() => dismissUpload(taskId), ARRIVE_MAX_MS)
        return () => clearTimeout(timer)
    }, [leavingTo, pathname, taskId])

    if (leavingTo || opening) return "opening"
    return isDone ? "done" : "idle"
}
