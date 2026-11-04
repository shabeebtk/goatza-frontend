"use client"

/**
 * UploadScreen — the expanded upload: what tapping Post opens.
 *
 * Mounted once by AppShell and once by OrgShell, beside UploadQueueBar, and
 * portalled to <body> so that no transformed or backdrop-filtered ancestor can
 * capture its `position: fixed`. Full screen on the app's surface on a phone,
 * a centred 440px card over a dim backdrop from 768px.
 *
 * A window on the queue, not part of it: minimizing, or never opening this at
 * all, changes nothing about the upload. It is where a task's actions live —
 * Cancel while it runs; Retry, Edit, "Post without sound" and Discard when it
 * fails — and what happens when a task finishes in front of its author is
 * useOpenWhenDone.
 *
 * The one history entry it owns is a back press that MINIMIZES, never cancels:
 * one back = minimize, the next back = normal navigation. It is pushed only
 * once history has settled (whenHistorySettled), because this opens in the
 * tick the composer closes. The screen itself appears at once, so the page is
 * never seen between the two.
 */

import { Icon } from "@iconify/react"
import { useEffect, useId, useRef, useState } from "react"

import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useBackToClose, whenHistorySettled } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { revealChrome } from "@/shared/hooks/useScrollChrome"
import { useSuspendPlayback } from "@/shared/media/playback"
import { returnFocus } from "@/shared/services/focusReturn"
import {
    cancelUpload,
    dismissUpload,
    editUpload,
    minimizeUploadView,
    retryUpload,
    retryUploadWithoutSound,
} from "@/shared/upload/uploadQueue"
import { useTaskDestination } from "@/shared/upload/useTaskDestination"
import { reanchorFixedElements } from "@/shared/utils/settleViewport"
import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"
import { useOpenWhenDone } from "./useOpenWhenDone"
import styles from "./UploadScreen.module.css"

const PHONE = "(max-width: 767px)"

/** Focusables inside the screen, for the Tab trap. */
const FOCUSABLE =
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea'

/** States a cancel can act on. Not publishing — the create is already in flight. */
const CANCELLABLE = new Set<QueueTask["status"]>(["preparing", "uploading", "processing"])

const RUNNING = new Set<QueueTask["status"]>(["preparing", "uploading", "publishing", "processing"])

function titleFor(task: QueueTask): string {
    const post = task.kind === "post"
    switch (task.status) {
        case "done":
            return post ? "Posted" : "Highlight added"
        case "failed":
            return post ? "Couldn't post" : "Couldn't add highlight"
        default:
            return post ? "Posting" : "Adding highlight"
    }
}

/** The status line, WITHOUT a count — also what the live region announces. */
function statusFor(task: QueueTask): string {
    switch (task.status) {
        case "preparing":
            return "Preparing…"
        case "uploading":
            return "Uploading…"
        case "publishing":
            return "Almost done…"
        case "processing":
            return task.preview.mediaType === "image" ? "Processing photo…" : "Processing video…"
        case "done":
            return task.kind === "post" ? "Posted" : "Highlight added"
        case "failed":
            return task.error?.message ?? "Something went wrong."
        case "cancelled":
            return "Cancelled"
    }
}

function hintFor(task: QueueTask): string | null {
    if (task.status === "preparing" || task.status === "uploading") {
        return "Keep Goatza open until the upload finishes. You can keep browsing."
    }
    if (task.status === "processing") {
        const what = task.preview.mediaType === "image" ? "photo" : "video"
        return `Your ${what} is being processed. You can leave — we'll tell you when it's live.`
    }
    return null
}

/** Prepare · Upload · Publish, with Process once the server is holding it. */
function stepsFor(task: QueueTask): { steps: string[]; current: number } {
    const held = task.status === "processing" || Boolean(task.publicationId)
    const steps = held
        ? ["Prepare", "Upload", "Process", "Publish"]
        : ["Prepare", "Upload", "Publish"]
    const name: Partial<Record<QueueTask["status"], string>> = {
        preparing: "Prepare",
        uploading: "Upload",
        processing: "Process",
        publishing: "Publish",
    }
    const step = name[task.status]
    return { steps, current: step ? steps.indexOf(step) : steps.length }
}

export default function UploadScreen() {
    const task = useUploadQueueStore((s) =>
        s.view === "expanded" ? s.tasks.find((t) => t.id === s.focusedTaskId) ?? null : null
    )
    if (!task) return null
    return (
        <Portal>
            <UploadScreenBody key={task.id} task={task} />
        </Portal>
    )
}

function UploadScreenBody({ task }: { task: QueueTask }) {
    const titleId = useId()
    const isPhone = useMediaQuery(PHONE)
    const panelRef = useRef<HTMLDivElement | null>(null)
    const minimizeRef = useRef<HTMLButtonElement | null>(null)

    const [confirming, setConfirming] = useState(false)
    const destination = useTaskDestination(task)
    const leaving = useUploadQueueStore((s) => s.opening?.taskId === task.id)
    // This screen mounted because the one before it navigated across shells:
    // its entry has already been popped, and pushing one here would leave a
    // ghost on the new page.
    const [cameMidFlight] = useState(leaving)

    const waiting = useUploadQueueStore(
        (s) =>
            s.tasks.filter(
                (t) => t.id !== task.id && t.actorKey === task.actorKey && RUNNING.has(t.status)
            ).length
    )

    useBodyScrollLock()
    // Takes over from the composer's in the same tick, so a video paused for
    // Create stays paused until this is minimized.
    useSuspendPlayback()
    // The bars are covered, so the toasts move to the top. A phone only: on
    // desktop this is a card, and the nav is still there around it.
    useHtmlFlag("chrome-covered", isPhone)

    // Declared after the scroll lock, so it runs after the release: however
    // the screen goes away, the page under it has its bars, and iOS has put
    // the fixed elements back (a keyboard may have gone away behind this).
    useEffect(
        () => () => {
            revealChrome()
            reanchorFixedElements()
        },
        []
    )

    const [historyReady, setHistoryReady] = useState(false)
    useEffect(() => whenHistorySettled(() => setHistoryReady(true)), [])

    const { requestClose, navigateAway } = useBackToClose(
        () => {
            // The flow's own pop, on its way to the destination: the screen
            // stays up saying "Opening…" until the page has arrived.
            if (useUploadQueueStore.getState().opening?.taskId === task.id) return
            minimizeUploadView()
        },
        { enabled: historyReady && !cameMidFlight }
    )

    const phase = useOpenWhenDone({ task, destination, navigateAway })

    const minimize = () => {
        // The entry is gone already, and the page is on its way.
        if (leaving) dismissUpload(task.id)
        else requestClose()
    }

    // Focus to Minimize, and back to wherever it was when this goes.
    // returnFocus for both: it keeps the ring off for a reader who tapped.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null
        returnFocus(minimizeRef.current)
        return () => returnFocus(opener)
    }, [])

    // A task that moved past cancelling while the question was up (it began
    // publishing) takes the question with it, and must not bring it back.
    const cancellable = CANCELLABLE.has(task.status)
    if (confirming && !cancellable) setConfirming(false)

    // Esc minimizes; Tab stays inside. Not while the question is up — that is
    // the question's Esc, and its Tab.
    useEffect(() => {
        if (confirming) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault()
                minimize()
                return
            }
            if (event.key !== "Tab") return

            const panel = panelRef.current
            if (!panel) return
            const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (!first || !last) {
                event.preventDefault()
                return
            }
            const active = document.activeElement
            if (event.shiftKey && (active === first || active === panel)) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && active === last) {
                event.preventDefault()
                first.focus()
            }
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    })

    const failed = task.status === "failed"
    const opening = phase === "opening"
    const finished = phase !== "idle"
    const highlight = task.kind === "highlight"

    return (
        <>
            <div
                className={styles.backdrop}
                onClick={(event) => {
                    if (event.target === event.currentTarget) minimize()
                }}
            >
                <div
                    ref={panelRef}
                    className={styles.panel}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    tabIndex={-1}
                >
                    <header className={styles.top}>
                        <button
                            ref={minimizeRef}
                            type="button"
                            className={styles.minimize}
                            onClick={minimize}
                            aria-label="Minimize"
                        >
                            <Icon icon="mdi:chevron-down" width={28} height={28} aria-hidden />
                        </button>
                        <h2 id={titleId} className={styles.title}>
                            {titleFor(task)}
                        </h2>
                        <span className={styles.topSpacer} aria-hidden="true" />
                    </header>

                    <div className={styles.body}>
                        <Preview task={task} finished={finished} />

                        {task.preview.mediaType !== "none" && task.label && (
                            <p className={styles.caption}>{task.label}</p>
                        )}

                        {/* Status changes only; the count is the progressbar's. */}
                        <p className="sr-only" role="status" aria-live="polite">
                            {opening ? openingLine(destination?.kind) : statusFor(task)}
                        </p>

                        {failed ? (
                            <div className={styles.failure}>
                                <Icon
                                    icon="mdi:alert-circle-outline"
                                    width={28}
                                    height={28}
                                    className={styles.failureIcon}
                                    aria-hidden
                                />
                                <p className={styles.failureText}>{statusFor(task)}</p>
                            </div>
                        ) : opening ? (
                            <div className={styles.opening} aria-hidden="true">
                                <span className={styles.spinner} />
                                <span>{openingLine(destination?.kind)}</span>
                            </div>
                        ) : (
                            <Progress task={task} waiting={waiting} />
                        )}

                        {!failed && !finished && hintFor(task) && (
                            <p className={styles.hint}>{hintFor(task)}</p>
                        )}
                    </div>

                    {!opening && (
                        <footer className={styles.actions}>
                            {failed ? (
                                <FailureActions task={task} />
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={styles.primaryBtn}
                                        onClick={minimize}
                                    >
                                        Keep browsing
                                    </button>
                                    {cancellable && (
                                        <button
                                            type="button"
                                            className={styles.textBtn}
                                            onClick={() => setConfirming(true)}
                                        >
                                            Cancel upload
                                        </button>
                                    )}
                                </>
                            )}
                        </footer>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirming && cancellable}
                title={highlight ? "Cancel this highlight?" : "Cancel this post?"}
                message={highlight ? "It won't be added to your highlights." : "It won't be posted."}
                confirmLabel={highlight ? "Cancel highlight" : "Cancel post"}
                cancelLabel="Keep going"
                tone="danger"
                onConfirm={() => {
                    setConfirming(false)
                    void cancelUpload(task.id)
                }}
                onCancel={() => setConfirming(false)}
            />
        </>
    )
}

const openingLine = (kind: "posts" | "profile" | undefined) =>
    kind === "profile" ? "Opening your profile…" : "Opening your posts…"

function Preview({ task, finished }: { task: QueueTask; finished: boolean }) {
    const [broken, setBroken] = useState(false)
    const src = task.preview.localThumbUrl
    const textOnly = task.preview.mediaType === "none"

    return (
        <div className={`${styles.preview} ${textOnly ? styles.previewText : ""}`}>
            {textOnly ? (
                <div className={styles.textCard}>
                    <p className={styles.textCardBody}>{task.label}</p>
                </div>
            ) : src && !broken ? (
                // A blob: URL or a converted poster, which next/image cannot
                // size without knowing it first.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt=""
                    className={styles.previewImg}
                    onError={() => setBroken(true)}
                />
            ) : (
                <div className={styles.previewIcon} aria-hidden="true">
                    <Icon
                        icon={task.preview.mediaType === "image" ? "mdi:image-outline" : "mdi:filmstrip"}
                        width={48}
                        height={48}
                    />
                </div>
            )}

            {finished && (
                <span className={styles.doneMark} aria-hidden="true">
                    <Icon icon="mdi:check" width={40} height={40} />
                </span>
            )}
        </div>
    )
}

function Progress({ task, waiting }: { task: QueueTask; waiting: number }) {
    const done = task.status === "done"
    const determinate = task.status === "preparing" || task.status === "uploading"
    const percent = done ? 100 : Math.round(task.progress * 100)
    const { steps, current } = stepsFor(task)

    return (
        <div className={styles.progress}>
            <div className={styles.statusRow} aria-hidden="true">
                {/* retryLabel: "Retrying… (2/4)", "Resuming…" */}
                <span className={styles.status}>{task.retryLabel ?? statusFor(task)}</span>
                {determinate && <span className={styles.percent}>{percent}%</span>}
            </div>

            <div
                className={`${styles.track} ${determinate || done ? "" : styles.trackBusy}`}
                role="progressbar"
                aria-label={task.kind === "post" ? "Post upload" : "Highlight upload"}
                aria-valuemin={0}
                aria-valuemax={100}
                // Absent while the server works: indeterminate, not 0.
                aria-valuenow={determinate || done ? percent : undefined}
            >
                <div
                    className={styles.fill}
                    style={determinate || done ? { width: `${percent}%` } : undefined}
                />
            </div>

            <ol className={styles.steps}>
                {steps.map((step, index) => (
                    <li
                        key={step}
                        className={[
                            styles.step,
                            index < current ? styles.stepDone : "",
                            index === current ? styles.stepCurrent : "",
                        ].join(" ")}
                        aria-current={index === current ? "step" : undefined}
                    >
                        {step}
                    </li>
                ))}
            </ol>

            {waiting > 0 && <p className={styles.waiting}>{waiting} more waiting</p>}
        </div>
    )
}

function FailureActions({ task }: { task: QueueTask }) {
    const canRetry = task.error?.canRetry
    // Retrying cannot help (too long, refused…): a post reopens its draft.
    const canEdit = !canRetry && Boolean(task.onEdit)

    return (
        <>
            {canRetry && (
                <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => retryUpload(task.id)}
                >
                    Retry
                </button>
            )}
            {canEdit && (
                <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => editUpload(task.id)}
                >
                    Edit
                </button>
            )}
            {task.error?.canRetryWithoutSound && (
                <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => retryUploadWithoutSound(task.id)}
                >
                    {task.kind === "post" ? "Post without sound" : "Add without sound"}
                </button>
            )}
            <button type="button" className={styles.textBtn} onClick={() => dismissUpload(task.id)}>
                Discard
            </button>
        </>
    )
}
