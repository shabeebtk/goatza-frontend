import { create } from "zustand"

import type { RequestActor } from "@/core/api/axios"
import type { UploadProgressMeta } from "@/shared/services/mediaUpload"
import type { PendingPublication } from "@/shared/services/publications"

/**
 * Posts and highlights going up in the background — the state behind
 * UploadQueueBar. The behaviour (one at a time, cancel, retry, the server's
 * half) lives in shared/upload/uploadQueue.ts; this is only what it shows.
 *
 * NO `persist`, deliberately: a task holds the author's files in memory, and
 * a reload loses those however it is stored. What survives a reload is the
 * server's half — a post it is holding is listed by GET /media/publications
 * and restored from there.
 */

export type QueueTaskKind = "post" | "highlight"

export type QueueTaskStatus =
    | "preparing"
    | "uploading"
    /** Uploaded; the server is converting the media and will publish it itself. */
    | "processing"
    /** The create request is in flight. */
    | "publishing"
    | "done"
    | "failed"
    | "cancelled"

export type QueueTaskError = {
    /** Written for the author — the server's sentence, or the upload's. */
    message: string
    /** False for a failure restored after a reload: its files are gone. */
    canRetry: boolean
    /** The browser could not keep the sound; the author may post without it. */
    canRetryWithoutSound?: boolean
}

export type QueueTaskResult = { postId?: string; highlightId?: string }

/** What a task's `run` is handed. */
export type QueueRunContext = {
    signal: AbortSignal
    /**
     * The account the task was started as. Pass it on EVERY request the run
     * makes: the author may switch account while it runs, and the store's
     * active actor would then sign, upload and create as someone else.
     */
    actor: RequestActor
    /** Set on a "Post without sound" retry. */
    allowSilentAudio: boolean
    /** The runner starts every run in "preparing". */
    setStatus: (status: "preparing" | "uploading" | "publishing") => void
    /** 0–1 of the whole run; the bar shows it in ~5% steps. */
    setProgress: (fraction: number, meta?: UploadProgressMeta) => void
}

/**
 * How a run ends: created now (the create answered 200/201), or held by the
 * server until its media is converted (202).
 */
export type QueueRunOutcome =
    | { kind: "done"; result: QueueTaskResult }
    | { kind: "processing"; publication: PendingPublication }

export type QueueTask = {
    id: string
    kind: QueueTaskKind
    /** The user id or org id it was posted as — shown only while that actor is active. */
    actorKey: string
    /** Who it was posted as, for every request it makes (it keeps running after a switch). */
    actor: RequestActor
    preview: { mediaType: "image" | "video" | "none"; localThumbUrl?: string }
    /** A short description (the caption), shown under the status line. */
    label: string
    status: QueueTaskStatus
    progress: number
    /** "Retrying… (2/4)" / "Resuming…" while bytes move. */
    retryLabel?: string
    error?: QueueTaskError
    result?: QueueTaskResult
    /** The server's PendingPublication, once the create answered 202. */
    publicationId?: string
    /** Absent on a task restored after a reload — it can only be dismissed. */
    run?: (ctx: QueueRunContext) => Promise<QueueRunOutcome>
    /**
     * Reopen the composer with this task's draft — offered instead of Retry
     * when trying the same thing again cannot help.
     */
    onEdit?: () => void
    allowSilentAudio?: boolean
    createdAt: number
}

type UploadQueueState = {
    tasks: QueueTask[]
    add: (task: QueueTask) => void
    patch: (id: string, patch: Partial<QueueTask>) => void
    remove: (id: string) => void
    clear: () => void
}

export const useUploadQueueStore = create<UploadQueueState>((set) => ({
    tasks: [],
    add: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
    patch: (id, patch) =>
        set((state) => ({
            tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
        })),
    remove: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
    clear: () => set({ tasks: [] }),
}))
