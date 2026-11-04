/**
 * The background upload queue: tap Post, keep using the app.
 *
 * A screen hands over a task — what to show, and a `run(ctx)` that prepares
 * the media, uploads it and makes the create request — and is done. The
 * runner owns everything after that, for as long as the tab lives:
 *
 *     preparing → uploading → publishing → done
 *                                       ↘ processing → done | failed   (202)
 *
 *   - ONE task at a time, first in first out, each with its own
 *     AbortController, and the screen wake lock held while it runs (an
 *     auto-lock mid-upload is the most common "random" iPhone failure).
 *   - 200/201 → done. 202 → processing: the server converts the media and
 *     publishes the post itself, so the author can leave. It is finished by
 *     the bus's publication_updated, with GET /media/publications every 10 s
 *     as the guarantee.
 *   - Retry re-runs `run` with the files it kept in memory; cancel aborts a
 *     running upload, or asks the server to drop a held one.
 *   - After a reload the files are gone, but the server's half is not: on
 *     mount and on every actor switch the posts it is still holding (or that
 *     failed) are listed and shown again, to finish or to dismiss.
 *
 * UploadQueueBar mounts `useUploadQueueRuntime` once per shell; screens call
 * {@link enqueueUpload}. A new task opens UploadScreen (full screen); Minimize
 * leaves the pill. What the two look like is theirs: nothing here changes
 * with the view except when a finished task is taken away.
 */

import { useEffect } from "react"

import { captureRequestActor, type RequestActor } from "@/core/api/axios"
import { queryClient } from "@/core/react-query/QueryProvider"
import { REALTIME_OPEN, realtimeBus } from "@/core/ws/realtimeBus"
import { highlightKeys } from "@/features/highlights/hooks/useHighlights"
import { getHighlightErrorMessage } from "@/features/highlights/services/highlights.api"
import { captureVideoThumbnail } from "@/features/messages/services/chatUpload.service"
import { invalidatePostLists, POST_CACHE_KEYS } from "@/features/posts/hooks/usePostMutations"
import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import { retryLabelFor } from "@/shared/components/ui/UploadOverlay/UploadOverlay"
import { holdScreenWakeLock } from "@/shared/hooks/useScreenWakeLock"
import { getApiErrorMessage, isUploadCancellation } from "@/shared/services/apiError"
import { ensureMediaCapabilities } from "@/shared/services/mediaCapabilities"
import { UPLOAD_CANCELLED } from "@/shared/services/mediaUpload"
import {
    cancelPublication,
    dismissPublication,
    fetchPublications,
    type PendingPublication,
} from "@/shared/services/publications"
import { isVideoAudioLostError } from "@/shared/services/videoEncode"
import { canRetryUpload, isRetryableJobCode } from "@/shared/upload/retryable"
import { useAuthStore } from "@/store/auth.store"
import {
    useUploadQueueStore,
    type QueueRunContext,
    type QueueRunOutcome,
    type QueueTask,
    type QueueTaskKind,
    type QueueTaskResult,
} from "@/store/uploadQueue.store"

/** Progress moves in 5% steps — enough for a bar, few enough renders. */
const PROGRESS_STEPS = 20

/** "Posted · View" stays on the pill this long, then it goes. */
const DONE_VISIBLE_MS = 5000

/** How often a held post is checked over HTTP while the socket is quiet. */
const PUBLICATION_POLL_MS = 10_000

const FAILURE_FALLBACK: Record<QueueTaskKind, string> = {
    post: "Couldn't share your post. Please try again.",
    highlight: "Couldn't add your highlight. Please try again.",
}

// ── State outside React ───────────────────────────────────────

const queue: string[] = []
/** Video tasks waiting for their preview frame before they may start. */
const awaitingPreview = new Set<string>()
let runningId: string | null = null
const controllers = new Map<string, AbortController>()
const doneTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Object URLs this module created for a preview, revoked with the task. */
const ownedUrls = new Map<string, string>()

const store = () => useUploadQueueStore.getState()
const getTask = (id: string) => store().tasks.find((task) => task.id === id)
const patch = (id: string, value: Partial<QueueTask>) => store().patch(id, value)

const newId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** The active actor: the org's id while acting as one, the user's otherwise. */
export function currentActorKey(): string | null {
    const { user, actorType, actorId } = useAuthStore.getState()
    if (!user) return null
    return actorType === "organization" && actorId ? actorId : user.id
}

/** {@link currentActorKey} for a captured actor. */
function actorKeyOf(actor: RequestActor): string {
    return actor.type === "organization" && actor.id
        ? actor.id
        : (useAuthStore.getState().user?.id ?? "")
}

/** {@link currentActorKey}, reactively. */
export function useActorKey(): string | null {
    const userId = useAuthStore((s) => s.user?.id ?? null)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)
    if (!userId) return null
    return actorType === "organization" && actorId ? actorId : userId
}

function removeTask(id: string) {
    const timer = doneTimers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    doneTimers.delete(id)

    const url = ownedUrls.get(id)
    if (url) URL.revokeObjectURL(url)
    ownedUrls.delete(id)

    const queued = queue.indexOf(id)
    if (queued >= 0) queue.splice(queued, 1)
    awaitingPreview.delete(id)
    store().remove(id)
}

// ── Enqueue ───────────────────────────────────────────────────

export type EnqueueUploadInput = {
    kind: QueueTaskKind
    /** Who it is posted as. Defaults to the active actor, captured NOW. */
    actor?: RequestActor
    label: string
    preview: QueueTask["preview"]
    /** The picked file, when there is no preview URL yet — one is made here. */
    previewFile?: File
    run: NonNullable<QueueTask["run"]>
    onEdit?: QueueTask["onEdit"]
    /** Where "View" and the open-when-done flow go. */
    destination?: QueueTask["destination"]
    /** Open the full-screen view on this task. Default true. */
    expand?: boolean
}

/** Hand a post or highlight to the queue. Returns the task id. */
export function enqueueUpload(input: EnqueueUploadInput): string {
    installAuthReset()

    const id = newId()
    // Frozen here, while the composer that made it is still on screen: the
    // task keeps running — as this account — after any switch.
    const actor = input.actor ?? captureRequestActor()
    store().add({
        id,
        kind: input.kind,
        actorKey: actorKeyOf(actor),
        actor,
        label: input.label,
        preview: input.preview,
        status: "preparing",
        progress: 0,
        run: input.run,
        onEdit: input.onEdit,
        destination: input.destination,
        createdAt: Date.now(),
    })
    // Only here: a task restored after a reload never comes through this
    // function, so it only ever appears on the pill.
    if (input.expand !== false) store().expand(id)

    const preview =
        input.previewFile && !input.preview.localThumbUrl
            ? attachPreview(id, input.previewFile, input.preview.mediaType)
            : null

    // A video's preview is a <video> element decoding a frame. Starting the
    // encoder at the same moment means two decoders on one 4K HEVC clip —
    // what an iPhone runs out of memory on. The frame settles within 6 s.
    if (preview && input.preview.mediaType === "video") {
        awaitingPreview.add(id)
        void preview.then(() => {
            // Cancelled (or signed out) while the frame was being grabbed.
            if (!awaitingPreview.delete(id) || !getTask(id)) return
            queue.push(id)
            void pump()
        })
        return id
    }

    queue.push(id)
    void pump()
    return id
}

/**
 * A preview from the picked file: the photo itself, or a frame of the video
 * (never blocking — `captureVideoThumbnail` settles within 6 s, with "" when
 * it cannot, and a film icon stands in).
 */
async function attachPreview(id: string, file: File, mediaType: QueueTask["preview"]["mediaType"]) {
    let url = ""
    try {
        url = mediaType === "video" ? await captureVideoThumbnail(file) : URL.createObjectURL(file)
    } catch {
        return
    }
    if (!url) return

    const task = getTask(id)
    if (!task) {
        URL.revokeObjectURL(url)
        return
    }
    ownedUrls.set(id, url)
    patch(id, { preview: { ...task.preview, localThumbUrl: url } })
}

// ── The runner ────────────────────────────────────────────────

async function pump() {
    if (runningId) return
    const id = queue.shift()
    if (!id) return

    runningId = id
    try {
        await runTask(id)
    } finally {
        runningId = null
        void pump()
    }
}

async function runTask(id: string) {
    const task = getTask(id)
    if (!task?.run) return

    const controller = new AbortController()
    controllers.set(id, controller)
    const releaseWakeLock = holdScreenWakeLock()

    let lastStep = -1
    patch(id, { status: "preparing", progress: 0, error: undefined, retryLabel: undefined })

    const ctx: QueueRunContext = {
        signal: controller.signal,
        actor: task.actor,
        allowSilentAudio: task.allowSilentAudio ?? false,
        setStatus: (status) => {
            if (!controller.signal.aborted) patch(id, { status })
        },
        setProgress: (fraction, meta) => {
            if (controller.signal.aborted) return
            const step = Math.floor(Math.max(0, Math.min(1, fraction)) * PROGRESS_STEPS)
            const retryLabel = retryLabelFor(meta) ?? undefined
            if (step === lastStep && retryLabel === getTask(id)?.retryLabel) return
            lastStep = step
            patch(id, { progress: step / PROGRESS_STEPS, retryLabel })
        },
    }

    try {
        const outcome: QueueRunOutcome = await task.run(ctx)

        if (outcome.kind === "done") {
            finishDone(id, outcome.result)
        } else {
            // A restore that ran while this create was in flight may already
            // show the same publication; this row is the one that can retry.
            for (const other of store().tasks) {
                if (other.id !== id && other.publicationId === outcome.publication.id) {
                    removeTask(other.id)
                }
            }
            patch(id, {
                status: "processing",
                progress: 1,
                retryLabel: undefined,
                publicationId: outcome.publication.id,
            })
            // It may already have settled — a job that finished before the
            // create, or a publication the server published at once.
            applyPublication(outcome.publication)
        }
    } catch (err) {
        if (controller.signal.aborted || isUploadCancellation(err)) {
            removeTask(id)
        } else {
            patch(id, {
                status: "failed",
                retryLabel: undefined,
                error: {
                    message: failureMessage(err, task.kind),
                    // Only when the same attempt could go differently: a
                    // validation refusal or a file too long fails the same way
                    // every time (a post offers Edit instead).
                    canRetry: canRetryUpload(err, task.kind),
                    canRetryWithoutSound: isVideoAudioLostError(err),
                },
            })
        }
    } finally {
        releaseWakeLock()
        controllers.delete(id)
    }
}

/**
 * The sentence for a failure. A highlight's goes through
 * getHighlightErrorMessage, as the old upload hook did: it never shows a
 * schema dump, and keeps the server's "You already have 10 highlights…".
 */
function failureMessage(err: unknown, kind: QueueTaskKind): string {
    return kind === "highlight"
        ? getHighlightErrorMessage(err, FAILURE_FALLBACK.highlight)
        : getApiErrorMessage(err, FAILURE_FALLBACK[kind])
}

function finishDone(id: string, result: QueueTaskResult) {
    const task = getTask(id)
    if (!task) return

    patch(id, { status: "done", progress: 1, result, retryLabel: undefined, error: undefined })

    if (task.kind === "post") {
        invalidatePostLists(queryClient)
    } else {
        // The rail, its stats, and the profile chip's highlights_count —
        // what useCreateHighlight refreshed when the modal made the create.
        void queryClient.invalidateQueries({ queryKey: highlightKeys.all })
        void queryClient.invalidateQueries({ queryKey: profileKeys.me() })
        const username = useAuthStore.getState().user?.username
        if (username) void queryClient.invalidateQueries({ queryKey: profileKeys.user(username) })
    }

    armDoneTimer(id)
}

/**
 * A finished task leaves the pill after DONE_VISIBLE_MS. Not while the screen
 * is showing it: the open-when-done flow removes it itself, and if the author
 * minimizes instead, minimizeUploadView starts the clock again.
 */
function armDoneTimer(id: string) {
    const previous = doneTimers.get(id)
    if (previous !== undefined) clearTimeout(previous)

    const timer = setTimeout(() => {
        doneTimers.delete(id)
        const { view, focusedTaskId } = store()
        if (view === "expanded" && focusedTaskId === id) return
        if (getTask(id)?.status === "done") removeTask(id)
    }, DONE_VISIBLE_MS)
    doneTimers.set(id, timer)
}

/** Back to the pill. A task already done gets its full time on it. */
export function minimizeUploadView() {
    const { view, focusedTaskId } = store()
    if (view !== "expanded") return
    store().minimize()
    if (focusedTaskId && getTask(focusedTaskId)?.status === "done") armDoneTimer(focusedTaskId)
}

/**
 * Resolves once the list refetches {@link finishDone} started have landed, or
 * after `maxMs`. A list nobody has on screen is not refetching at all, so this
 * is usually already true; its page fetches when it mounts.
 */
export function waitForListRefresh(kind: QueueTaskKind, maxMs: number): Promise<void> {
    const keys = kind === "post" ? POST_CACHE_KEYS : [highlightKeys.all]
    const busy = () =>
        keys.some((queryKey) => queryClient.isFetching({ queryKey: [...queryKey] }) > 0)

    return new Promise((resolve) => {
        if (!busy()) {
            resolve()
            return
        }
        const finish = () => {
            clearTimeout(timer)
            unsubscribe()
            resolve()
        }
        const timer = setTimeout(finish, maxMs)
        const unsubscribe = queryClient.getQueryCache().subscribe(() => {
            if (!busy()) finish()
        })
    })
}

// ── The server's half ─────────────────────────────────────────

/** A publication_updated (or a poll) for a task waiting on the server. */
function applyPublication(publication: PendingPublication) {
    const task = store().tasks.find((t) => t.publicationId === publication.id)
    if (!task || task.status !== "processing") return

    switch (publication.status) {
        case "published": {
            const resultId = publication.result_id ?? undefined
            finishDone(
                task.id,
                task.kind === "post" ? { postId: resultId } : { highlightId: resultId }
            )
            return
        }
        case "failed":
            patch(task.id, {
                status: "failed",
                error: {
                    message: publication.error_message || FAILURE_FALLBACK[task.kind],
                    // A worker that timed out may do better next time; a clip
                    // that is too long, or an org the author left, will not.
                    canRetry: Boolean(task.run) && isRetryableJobCode(publication.error_code),
                },
            })
            return
        case "cancelled":
            removeTask(task.id)
            return
    }
}

const targetKind = (publication: PendingPublication): QueueTaskKind =>
    publication.target === "highlight" ? "highlight" : "post"

/**
 * Ask the server about every publication of the active actor. Settles the
 * tasks waiting on one; with `restore`, also shows the ones this tab does not
 * know about — after a reload, or another device's.
 */
async function refreshPublications({ restore }: { restore: boolean }) {
    const actorKey = currentActorKey()
    if (!actorKey) return
    const actor = captureRequestActor()

    if (restore) {
        // With server processing off nothing is ever held: no /media/* call
        // on every shell mount and account switch.
        const capabilities = await ensureMediaCapabilities()
        if (!capabilities.server_processing) return
        // A create may be in flight; its 202 brings the same publication and
        // would show twice. The poll after it settles catches up.
        if (store().tasks.some((t) => t.actorKey === actorKey && t.status === "publishing")) return
    }

    let publications: PendingPublication[]
    try {
        // A restore asks only for what it shows: the server answers the
        // newest 20, and published rows would crowd out an older failure.
        // The poll asks for "published" too — a held post that went live
        // while the socket was down is only visible to a poll that asks.
        publications = await fetchPublications(
            restore ? ["processing", "failed"] : ["processing", "failed", "published"],
            actor
        )
    } catch {
        return
    }
    // The actor changed while the request was out; its answer is not ours.
    if (currentActorKey() !== actorKey) return

    for (const publication of publications) {
        const known = store().tasks.find((t) => t.publicationId === publication.id)
        if (known) {
            applyPublication(publication)
            continue
        }

        if (!restore) continue
        if (publication.status !== "processing" && publication.status !== "failed") continue

        const kind = targetKind(publication)
        store().add({
            id: newId(),
            kind,
            actorKey,
            actor,
            label: publication.preview.content,
            preview: {
                mediaType: publication.preview.media_type ?? "none",
                localThumbUrl: publication.preview.thumbnail_url ?? undefined,
            },
            status: publication.status,
            progress: 1,
            publicationId: publication.id,
            ...(publication.status === "failed"
                ? {
                      error: {
                          message: publication.error_message || FAILURE_FALLBACK[kind],
                          canRetry: false,
                      },
                  }
                : {}),
            createdAt: Date.parse(publication.created_at) || Date.now(),
        })
    }
}

// ── Actions ───────────────────────────────────────────────────

/** Run a failed task again, with the files it kept. */
export function retryUpload(id: string, { withoutSound = false } = {}) {
    const task = getTask(id)
    if (!task?.run || task.status !== "failed") return

    // The server's copy of the failure would come back on the next reload.
    if (task.publicationId) {
        void dismissPublication(task.publicationId, task.actor).catch(() => {})
    }

    patch(id, {
        status: "preparing",
        progress: 0,
        error: undefined,
        retryLabel: undefined,
        publicationId: undefined,
        allowSilentAudio: withoutSound || task.allowSilentAudio,
    })
    queue.push(id)
    void pump()
}

export const retryUploadWithoutSound = (id: string) => retryUpload(id, { withoutSound: true })

/**
 * Stop a task: a queued one is dropped, a running one aborted (it removes
 * itself once the abort lands), a held one cancelled on the server. A task
 * that is publishing cannot be cancelled — the create is already in flight.
 */
export async function cancelUpload(id: string) {
    const task = getTask(id)
    if (!task) return

    // Not started yet: waiting its turn, or for its preview frame.
    if (queue.includes(id) || awaitingPreview.has(id)) {
        removeTask(id)
        return
    }

    const controller = controllers.get(id)
    if (controller && (task.status === "preparing" || task.status === "uploading")) {
        controller.abort(new Error(UPLOAD_CANCELLED))
        return
    }

    if (task.status === "processing" && task.publicationId) {
        try {
            await cancelPublication(task.publicationId, task.actor)
            removeTask(id)
        } catch {
            // Too late (it published or failed meanwhile) or offline: ask
            // the server what really happened rather than guess.
            void refreshPublications({ restore: false })
        }
    }
}

/** Close a finished or failed row. A failure the server holds is dismissed there too. */
export function dismissUpload(id: string) {
    const task = getTask(id)
    if (!task) return
    if (task.status === "failed" && task.publicationId) {
        void dismissPublication(task.publicationId, task.actor).catch(() => {})
    }
    removeTask(id)
}

/**
 * A failure no retry can fix: reopen the composer with the task's draft so
 * the author can change what was refused, and drop the failed row.
 */
export function editUpload(id: string) {
    const task = getTask(id)
    if (!task?.onEdit || task.status !== "failed") return
    task.onEdit()
    dismissUpload(id)
}

// ── Sign-out ──────────────────────────────────────────────────

let authResetInstalled = false

/** Signing out stops everything: the next person on this device sees none of it. */
function installAuthReset() {
    if (authResetInstalled) return
    authResetInstalled = true
    useAuthStore.subscribe((state, previous) => {
        if (previous.user && !state.user) {
            for (const controller of controllers.values()) {
                controller.abort(new Error(UPLOAD_CANCELLED))
            }
            queue.length = 0
            for (const task of store().tasks) removeTask(task.id)
            store().clear()
        }
    })
}

// ── Runtime, mounted once per shell ───────────────────────────

/**
 * Everything the queue needs while the app is on screen: the realtime
 * listener, the restore after a reload or an actor switch, the poll while a
 * post is held, and the leave-page prompt while files are still on the
 * device. Mounted by UploadQueueBar, which AppShell and OrgShell each mount
 * once — and on chat pages too, where the bar itself is hidden.
 */
export function useUploadQueueRuntime(): void {
    const actorKey = useActorKey()
    const tasks = useUploadQueueStore((s) => s.tasks)

    const waiting = tasks.some((t) => t.status === "processing" && t.actorKey === actorKey)
    // ONLY while the files are still on this device. Once the server holds
    // the post, leaving is safe — the upload screen says so.
    const onDevice = tasks.some((t) => t.status === "preparing" || t.status === "uploading")

    useEffect(() => {
        installAuthReset()
        const offUpdate = realtimeBus.on<{ publication?: PendingPublication }>(
            "publication_updated",
            (event) => {
                if (event.publication) applyPublication(event.publication)
            }
        )
        // The socket was down: anything it missed, ask for now.
        const offOpen = realtimeBus.on(REALTIME_OPEN, () => {
            const active = currentActorKey()
            if (store().tasks.some((t) => t.status === "processing" && t.actorKey === active)) {
                void refreshPublications({ restore: false })
            }
        })
        return () => {
            offUpdate()
            offOpen()
        }
    }, [])

    useEffect(() => {
        if (actorKey) void refreshPublications({ restore: true })
    }, [actorKey])

    useEffect(() => {
        if (!waiting) return
        const timer = setInterval(
            () => void refreshPublications({ restore: false }),
            PUBLICATION_POLL_MS
        )
        return () => clearInterval(timer)
    }, [waiting])

    useEffect(() => {
        if (!onDevice) return
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            // Older browsers need the property set to show the prompt.
            event.returnValue = ""
        }
        window.addEventListener("beforeunload", onBeforeUnload)
        return () => window.removeEventListener("beforeunload", onBeforeUnload)
    }, [onDevice])
}
