"use client"

/**
 * UploadQueueBar — the minimized upload: one small pill, "Posting 45%".
 *
 * Mounted once by AppShell and once by OrgShell (never both). Under the top
 * bar on a phone — following it exactly like the toasts do (`--top-nav-h` ×
 * (1 − `--chrome-progress`), plus the safe area) — and at the top of the main
 * column on desktop. Hidden on chat threads, under `data-chrome-covered`, and
 * while UploadScreen is showing a task. Only the ACTIVE actor's tasks.
 *
 * Tapping it opens UploadScreen on that task, which is where Retry, Edit,
 * Discard and Cancel live. "Posted · View" goes to the task's destination.
 *
 * The queue itself (shared/upload/uploadQueue.ts) runs whether or not this is
 * visible: it mounts the runtime even on a chat page.
 */

import { Icon } from "@iconify/react"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import {
    dismissUpload,
    useActorKey,
    useUploadQueueRuntime,
} from "@/shared/upload/uploadQueue"
import { useTaskDestination } from "@/shared/upload/useTaskDestination"
import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"
import styles from "./UploadQueueBar.module.css"

/** The chat thread, where every bar is already hidden — user app and org admin. */
const CHAT_PAGES = [/^\/messages\/.+/, /^\/organization\/admin\/[^/]+\/messages\/.+/]

/**
 * Which task the one pill speaks for, lowest first. "Posted" only stays a few
 * seconds, so it goes first; a failure is next, because it waits for the
 * author; then whatever is actually moving.
 */
const PILL_ORDER: Record<QueueTask["status"], number> = {
    done: 0,
    failed: 1,
    uploading: 2,
    publishing: 3,
    preparing: 4,
    processing: 5,
    cancelled: 6,
}

function pillLabel(task: QueueTask, canView: boolean): string {
    const post = task.kind === "post"
    if (task.retryLabel) return task.retryLabel
    switch (task.status) {
        case "preparing":
        case "uploading":
            return `${post ? "Posting" : "Adding"} ${Math.round(task.progress * 100)}%`
        case "processing":
            return "Processing…"
        case "publishing":
            return "Almost done…"
        case "done": {
            const finished = post ? "Posted" : "Highlight added"
            return canView ? `${finished} · View` : finished
        }
        case "failed":
            return "Upload failed · Tap to fix"
        case "cancelled":
            return "Cancelled"
    }
}

/**
 * What the live region says: the label WITHOUT the count. It changes when the
 * task moves on, not every 5%.
 */
function announcement(task: QueueTask): string {
    const post = task.kind === "post"
    switch (task.status) {
        case "preparing":
        case "uploading":
            return post ? "Posting…" : "Adding highlight…"
        case "processing":
            return "Processing…"
        case "publishing":
            return "Almost done…"
        case "done":
            return post ? "Posted" : "Highlight added"
        case "failed":
            return task.error?.message ?? "Upload failed"
        case "cancelled":
            return "Cancelled"
    }
}

export default function UploadQueueBar() {
    // Runs on every page, the hidden ones included — see the module comment.
    useUploadQueueRuntime()

    const pathname = usePathname()
    const actorKey = useActorKey()
    const tasks = useUploadQueueStore((s) => s.tasks)
    const expanded = useUploadQueueStore(
        (s) => s.view === "expanded" && s.tasks.some((t) => t.id === s.focusedTaskId)
    )

    // Selected as the store's own array and narrowed here: a selector that
    // returned a fresh filtered array would re-render forever.
    const visible = useMemo(
        () =>
            tasks
                .filter((t) => t.actorKey === actorKey && t.status !== "cancelled")
                .sort((a, b) => PILL_ORDER[a.status] - PILL_ORDER[b.status]),
        [tasks, actorKey]
    )

    const current = visible[0]
    const onChatPage = CHAT_PAGES.some((pattern) => pattern.test(pathname ?? ""))

    if (onChatPage || expanded || !current) return null

    const waiting = visible.filter((t) => t.id !== current.id && t.status !== "done").length

    return (
        <div className={styles.bar} role="region" aria-label="Uploads">
            <Pill key={current.id} task={current} waiting={waiting} />
        </div>
    )
}

function Pill({ task, waiting }: { task: QueueTask; waiting: number }) {
    const router = useRouter()
    const pathname = usePathname()
    const expand = useUploadQueueStore((s) => s.expand)
    const destination = useTaskDestination(task)

    const done = task.status === "done"
    const failed = task.status === "failed"
    const label = pillLabel(task, destination !== null)

    const press = () => {
        if (!done) {
            expand(task.id)
            return
        }
        if (destination && destination.href !== pathname) router.push(destination.href)
        dismissUpload(task.id)
    }

    return (
        <>
            {/* Announced on a status change only; see announcement(). */}
            <p className="sr-only" role="status" aria-live="polite">
                {announcement(task)}
            </p>
            <button
                type="button"
                className={[
                    styles.pill,
                    failed ? styles.failed : "",
                    done ? styles.done : "",
                ].join(" ")}
                onClick={press}
                aria-label={waiting > 0 ? `${label}, ${waiting} more waiting` : label}
            >
                <Ring task={task} />
                <span className={styles.label}>{label}</span>
                {waiting > 0 && (
                    <span className={styles.more} aria-hidden="true">
                        +{waiting}
                    </span>
                )}
            </button>
        </>
    )
}

/** The thumbnail inside a ring that fills with the upload. */
function Ring({ task }: { task: QueueTask }) {
    const failed = task.status === "failed"
    const done = task.status === "done"
    const busy = task.status === "processing" || task.status === "publishing"
    // pathLength="100": the dash is simply the percentage.
    const filled = failed || done ? 100 : busy ? 25 : Math.round(task.progress * 100)

    return (
        <span className={styles.ringWrap} aria-hidden="true">
            <Thumb task={task} />
            <svg className={`${styles.ring} ${busy ? styles.ringBusy : ""}`} viewBox="0 0 34 34">
                <circle className={styles.ringTrack} cx="17" cy="17" r="15.5" />
                <circle
                    className={styles.ringFill}
                    cx="17"
                    cy="17"
                    r="15.5"
                    pathLength={100}
                    strokeDasharray={`${filled} 100`}
                />
            </svg>
            {(failed || done) && (
                <span className={styles.ringMark}>
                    <Icon icon={failed ? "mdi:exclamation" : "mdi:check"} width={16} height={16} />
                </span>
            )}
        </span>
    )
}

/** The local preview, or a frame of the video, or an icon when there is neither. */
function Thumb({ task }: { task: QueueTask }) {
    const [broken, setBroken] = useState(false)
    const src = task.preview.localThumbUrl

    if (src && !broken) {
        return (
            // A blob: URL or a converted poster — next/image would only add a
            // loader round-trip for a 28 px circle.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className={styles.thumb} onError={() => setBroken(true)} />
        )
    }

    const icon =
        task.preview.mediaType === "image"
            ? "mdi:image-outline"
            : task.preview.mediaType === "none"
              ? "mdi:text"
              : "mdi:filmstrip"

    return (
        <span className={`${styles.thumb} ${styles.thumbIcon}`}>
            <Icon icon={icon} />
        </span>
    )
}
