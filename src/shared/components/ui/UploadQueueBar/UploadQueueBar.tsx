"use client"

/**
 * UploadQueueBar — the small "Posting… 45%" strip, Instagram-style.
 *
 * Mounted once by AppShell and once by OrgShell (never both). Under the top
 * bar on a phone — following it exactly like the toasts do (`--top-nav-h` ×
 * (1 − `--chrome-progress`), plus the safe area) — and centred under the nav
 * on desktop. Not on chat pages, never on public pages (they have neither
 * shell), and hidden while a full-screen viewer covers the chrome
 * (`data-chrome-covered`).
 *
 * One compact row per task of the ACTIVE actor, newest first, at most three.
 * The queue itself (shared/upload/uploadQueue.ts) runs whether or not this
 * is visible: it mounts the runtime even on a chat page.
 */

import { Icon } from "@iconify/react"
import { usePathname, useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useNavigation } from "@/shared/services/navigation.service"
import {
    cancelUpload,
    dismissUpload,
    editUpload,
    retryUpload,
    retryUploadWithoutSound,
    useActorKey,
    useUploadQueueRuntime,
} from "@/shared/upload/uploadQueue"
import { useAuthStore } from "@/store/auth.store"
import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"
import styles from "./UploadQueueBar.module.css"

const MAX_ROWS = 3

/** The chat thread, where every bar is already hidden — user app and org admin. */
const CHAT_PAGES = [/^\/messages\/.+/, /^\/organization\/admin\/[^/]+\/messages\/.+/]

/** States a cancel would throw away work in, so it asks first. */
const CANCELLABLE = new Set<QueueTask["status"]>(["preparing", "uploading", "processing"])

function statusLine(task: QueueTask): string {
    const percent = `${Math.round(task.progress * 100)}%`
    switch (task.status) {
        case "preparing":
            return "Preparing…"
        case "uploading":
            return task.kind === "post" ? `Posting… ${percent}` : `Adding highlight… ${percent}`
        case "processing":
            return task.preview.mediaType === "video"
                ? "Processing video… you can leave the app"
                : "Processing… you can leave the app"
        case "publishing":
            return "Almost done…"
        case "done":
            return task.kind === "post" ? "Posted" : "Highlight added"
        case "failed":
            return task.error?.message ?? "Something went wrong."
        case "cancelled":
            return "Cancelled"
    }
}

/**
 * What the row's live region says: the status line WITHOUT the count. It
 * changes when the task moves on, not every 5% — the percentage is the
 * progressbar's aria-valuenow, for whoever asks.
 */
function announcement(task: QueueTask): string {
    if (task.status === "uploading") {
        return task.kind === "post" ? "Posting…" : "Adding highlight…"
    }
    return statusLine(task)
}

export default function UploadQueueBar() {
    // Runs on every page, the hidden ones included — see the module comment.
    useUploadQueueRuntime()

    const pathname = usePathname()
    const actorKey = useActorKey()
    const tasks = useUploadQueueStore((s) => s.tasks)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    // Selected as the store's own array and narrowed here: a selector that
    // returned a fresh filtered array would re-render forever.
    const rows = useMemo(
        () =>
            tasks
                .filter((t) => t.actorKey === actorKey && t.status !== "cancelled")
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, MAX_ROWS),
        [tasks, actorKey]
    )

    const confirming = rows.find((t) => t.id === confirmId) ?? null
    const onChatPage = CHAT_PAGES.some((pattern) => pattern.test(pathname ?? ""))

    if (onChatPage || rows.length === 0) return null

    return (
        <>
            <div className={styles.bar} role="region" aria-label="Uploads">
                {rows.map((task) => (
                    <QueueRow
                        key={task.id}
                        task={task}
                        onCancel={() => setConfirmId(task.id)}
                    />
                ))}
            </div>

            <ConfirmDialog
                open={confirming !== null}
                title={confirming?.kind === "highlight" ? "Cancel this highlight?" : "Cancel this post?"}
                message={
                    confirming?.kind === "highlight"
                        ? "It won't be added to your highlights."
                        : "It won't be posted."
                }
                confirmLabel={confirming?.kind === "highlight" ? "Cancel highlight" : "Cancel post"}
                cancelLabel="Keep going"
                tone="danger"
                onConfirm={() => {
                    if (confirming) void cancelUpload(confirming.id)
                    setConfirmId(null)
                }}
                onCancel={() => setConfirmId(null)}
            />
        </>
    )
}

function QueueRow({ task, onCancel }: { task: QueueTask; onCancel: () => void }) {
    const router = useRouter()
    const { toPost, toProfile } = useNavigation()
    const username = useAuthStore((s) => s.user?.username)
    const actingAsOrg = useAuthStore((s) => s.actorType === "organization")

    const failed = task.status === "failed"
    const done = task.status === "done"
    const busy = task.status === "processing" || task.status === "publishing"
    const determinate = task.status === "preparing" || task.status === "uploading"

    const view = () => {
        if (task.result?.postId) {
            router.push(toPost(task.result.postId, actingAsOrg ? "organization" : "user"))
        } else if (task.result?.highlightId && username) {
            router.push(toProfile(username))
        }
        dismissUpload(task.id)
    }

    const secondary = task.retryLabel ?? (failed || done ? null : task.label || null)
    const percent = Math.round(task.progress * 100)
    // Retrying cannot help (too long, refused…): a post reopens its draft.
    const canEdit = failed && !task.error?.canRetry && Boolean(task.onEdit)

    return (
        <div
            className={[
                styles.row,
                failed ? styles.failed : "",
                done ? styles.done : "",
            ].join(" ")}
        >
            <Thumb task={task} />

            <div className={styles.text}>
                {/* Announced on a status change only; see announcement(). */}
                <p className="sr-only" role="status" aria-live="polite">
                    {announcement(task)}
                </p>
                <p className={styles.primary} aria-hidden="true">
                    {failed && (
                        <Icon icon="mdi:alert-circle-outline" className={styles.errorIcon} aria-hidden />
                    )}
                    {done && <Icon icon="mdi:check" className={styles.doneIcon} aria-hidden />}
                    <span>{statusLine(task)}</span>
                </p>
                {secondary && <p className={styles.secondary}>{secondary}</p>}
            </div>

            <div className={styles.actions}>
                {done && (task.result?.postId || task.result?.highlightId) && (
                    <button type="button" className={styles.action} onClick={view}>
                        View
                    </button>
                )}

                {failed && task.error?.canRetryWithoutSound && (
                    <button
                        type="button"
                        className={styles.action}
                        onClick={() => retryUploadWithoutSound(task.id)}
                    >
                        {task.kind === "post" ? "Post without sound" : "Add without sound"}
                    </button>
                )}
                {failed && task.error?.canRetry && (
                    <button
                        type="button"
                        className={`${styles.action} ${styles.actionPrimary}`}
                        onClick={() => retryUpload(task.id)}
                    >
                        Retry
                    </button>
                )}
                {canEdit && (
                    <button
                        type="button"
                        className={`${styles.action} ${styles.actionPrimary}`}
                        onClick={() => editUpload(task.id)}
                    >
                        Edit
                    </button>
                )}
                {failed && (
                    <button type="button" className={styles.action} onClick={() => dismissUpload(task.id)}>
                        Discard
                    </button>
                )}

                {CANCELLABLE.has(task.status) && (
                    <button
                        type="button"
                        className={styles.iconButton}
                        onClick={onCancel}
                        aria-label={task.kind === "post" ? "Cancel post" : "Cancel highlight"}
                    >
                        <Icon icon="mdi:close" aria-hidden />
                    </button>
                )}
                {done && (
                    <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => dismissUpload(task.id)}
                        aria-label="Close"
                    >
                        <Icon icon="mdi:close" aria-hidden />
                    </button>
                )}
            </div>

            {!failed && (
                <div
                    className={`${styles.track} ${busy ? styles.indeterminate : ""}`}
                    role="progressbar"
                    aria-label={task.kind === "post" ? "Post upload" : "Highlight upload"}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    // Absent while the server works: indeterminate, not 0.
                    aria-valuenow={determinate ? percent : done ? 100 : undefined}
                >
                    <div
                        className={styles.fill}
                        style={determinate ? { width: `${percent}%` } : undefined}
                    />
                </div>
            )}
        </div>
    )
}

/** The local preview, or a frame of the video, or an icon when there is neither. */
function Thumb({ task }: { task: QueueTask }) {
    const [broken, setBroken] = useState(false)
    const src = task.preview.localThumbUrl

    if (src && !broken) {
        return (
            // A blob: URL or a converted poster — next/image would only add a
            // loader round-trip for a 40 px square.
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt=""
                className={styles.thumb}
                onError={() => setBroken(true)}
            />
        )
    }

    return (
        <span className={`${styles.thumb} ${styles.thumbIcon}`} aria-hidden>
            <Icon icon={task.preview.mediaType === "image" ? "mdi:image-outline" : "mdi:filmstrip"} />
        </span>
    )
}
