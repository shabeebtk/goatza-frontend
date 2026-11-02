/**
 * Uploading an ORIGINAL for the server to convert, and waiting for it.
 *
 * When the browser cannot prepare a file (no WebCodecs, iOS decoder memory,
 * HEVC that only some devices play, a .m4v/.3gp/.mkv, a photo it cannot
 * decode) and the server can (mediaCapabilities.ts), the file goes up as it
 * is — a "source" — and a worker converts it into the same files the browser
 * would have made:
 *
 *     uploadSource → createMediaJob → (worker) → waitForMediaJob → READY job
 *
 * A post or highlight does not wait at all: it names the job
 * (`{media_job_id}`) and the server holds the post until the job is ready.
 * waitForMediaJob is for a flow that needs the files before it can send
 * anything (chat).
 *
 * The upload is the existing machinery, unchanged: ONE signature request for
 * one file of kind "source", through `uploadSignedBatch` (so an expired URL
 * re-signs), a single PUT under the multipart threshold and parts above it.
 */

import { isAxiosError } from "axios"

import api, { withActor, type RequestActor } from "@/core/api/axios"
import { REALTIME_OPEN, realtimeBus } from "@/core/ws/realtimeBus"
import { fileExtension } from "@/shared/constants/media"
import type { MediaPurpose } from "@/shared/services/mediaCapabilities"
import {
    UploadError,
    getUploadConfigApi,
    putSourceFor,
    uploadSignedBatch,
    type MediaUploadType,
    type UploadFileDescriptor,
    type UploadProgress,
} from "@/shared/services/mediaUpload"
import { reportMediaJobFailure, type UploadFlow } from "@/shared/services/uploadTelemetry"
import { UploadRefusal } from "@/shared/upload/uploadRefusal"

// ── Content types ─────────────────────────────────────────────

/**
 * Exactly the backend's SOURCE_VIDEO_CONTENT_TYPES ∪ SOURCE_IMAGE_CONTENT_TYPES
 * (apps/media/constants.py). Anything else is refused at signing.
 */
export const SOURCE_VIDEO_CONTENT_TYPES: ReadonlySet<string> = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
    "video/3gpp",
    "video/3gpp2",
    "video/x-matroska",
    "video/x-msvideo",
    "video/avi",
])

export const SOURCE_IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/tiff",
    "image/bmp",
])

/** For a file the browser gave no usable type: its extension decides. */
const TYPE_BY_EXTENSION: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    qt: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
    tif: "image/tiff",
    tiff: "image/tiff",
    bmp: "image/bmp",
}

const isSourceType = (type: string) =>
    SOURCE_VIDEO_CONTENT_TYPES.has(type) || SOURCE_IMAGE_CONTENT_TYPES.has(type)

/**
 * The content type a source is signed under, or null when the server would
 * not take it. The browser's type when it is one the server knows; when it
 * is "", application/octet-stream or something non-standard ("image/jpg",
 * "video/x-quicktime"), the extension's.
 */
export function sourceContentType(file: File): string | null {
    const type = (file.type || "").toLowerCase()
    if (isSourceType(type)) return type
    return TYPE_BY_EXTENSION[fileExtension(file.name)] ?? null
}

/** "video" | "image" for a source content type. */
export const sourceKindOf = (contentType: string): "video" | "image" =>
    contentType.startsWith("video/") ? "video" : "image"

/** What a flow says when a file is not one the server can take either. */
export const SOURCE_TYPE_UNSUPPORTED_MESSAGE = "This file type isn't supported."

// ── Upload ────────────────────────────────────────────────────

export type UploadSourceOptions = {
    /** The POLICY type it is signed under — a highlight signs as "posts". */
    uploadType: MediaUploadType
    /** What the conversion is for; recorded for the job, not for signing. */
    purpose: MediaPurpose
    orgId?: string
    /** Land in an in-flight post/recruitment batch's folder. */
    tempPostId?: string
    signal?: AbortSignal
    onProgress?: UploadProgress
    flow: UploadFlow
    /** The account a background upload started under (axios.ts, RequestActor). */
    actor?: RequestActor
}

export type UploadedSource = {
    key: string
    publicUrl: string
    contentType: string
    /** The batch folder it landed in (posts/recruitments). */
    tempPostId?: string
}

/**
 * Upload one original. ONE signature request for one `source` file, then the
 * usual PUT — retried, resumed, re-signed into the same folder when its URL
 * runs out — or parts above the multipart threshold.
 *
 * Rejects with an `UploadError` (cancel included) like every other upload,
 * or with {@link SOURCE_TYPE_UNSUPPORTED_MESSAGE} for a type the server would
 * refuse — checked before anything is sent.
 */
export async function uploadSource(
    file: File,
    { uploadType, orgId, tempPostId, signal, onProgress, flow, actor }: UploadSourceOptions
): Promise<UploadedSource> {
    const contentType = sourceContentType(file)
    if (!contentType) throw new UploadRefusal(SOURCE_TYPE_UNSUPPORTED_MESSAGE)

    const descriptor: UploadFileDescriptor = {
        content_type: contentType,
        size_bytes: file.size,
        kind: "source",
    }

    const { entries, tempPostId: folder } = await uploadSignedBatch(
        [
            {
                blob: file,
                descriptor,
                onProgress,
                put: putSourceFor(uploadType, orgId, actor),
            },
        ],
        {
            sign: (files, resignInto) =>
                getUploadConfigApi(
                    uploadType,
                    files,
                    orgId,
                    signal,
                    resignInto ?? tempPostId,
                    actor
                ),
            signal,
            flow,
        }
    )

    const [entry] = entries
    return {
        key: entry.key,
        publicUrl: entry.public_url,
        contentType,
        tempPostId: folder ?? tempPostId,
    }
}

// ── Jobs ──────────────────────────────────────────────────────

export type MediaJobStatus = "queued" | "processing" | "ready" | "failed"

/** The server's job payload — one shape for REST and media_job_updated. */
export type MediaJob = {
    id: string
    status: MediaJobStatus
    kind: "image" | "video"
    purpose: MediaPurpose
    error_code: string | null
    /** The human sentence; shown as is. */
    error_message: string | null
    // Present once ready — the same names an attach request takes.
    file_url?: string
    public_id?: string
    thumbnail_url?: string
    width?: number | null
    height?: number | null
    duration?: number | null
    size_bytes?: number | null
    media_type?: "image" | "video"
}

/** A job that failed, or was refused. `message` is the server's sentence. */
export class MediaJobError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
        super(message)
        // Keeps `instanceof` honest if a build ever downlevels classes.
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = "MediaJobError"
        this.code = code
    }
}

export const isMediaJobError = (err: unknown): err is MediaJobError =>
    err instanceof MediaJobError

const GENERIC_JOB_MESSAGE = "Something went wrong processing this file. Please try again"

const jobFrom = (data: unknown): MediaJob => (data as { job: MediaJob }).job

/**
 * A refusal from POST /media/jobs as a MediaJobError, when the server said
 * which one (`code` beside the errors: SOURCE_MISSING, SOURCE_TOO_LARGE,
 * server_processing_unavailable…). Anything else is left as it came.
 */
function asJobRefusal(err: unknown): unknown {
    if (!isAxiosError(err) || err.response?.status !== 400) return err
    const body = err.response.data as { message?: string; data?: { code?: string } }
    const code = body?.data?.code
    if (!code) return err
    return new MediaJobError(code, body?.message || GENERIC_JOB_MESSAGE)
}

/** Hand an uploaded source to the worker. Idempotent on the key. */
export async function createMediaJob({
    key,
    purpose,
    uploadType,
    orgId,
    signal,
    flow = "single",
    actor,
}: {
    key: string
    purpose: MediaPurpose
    uploadType: MediaUploadType
    orgId?: string
    signal?: AbortSignal
    flow?: UploadFlow
    /** The source's signer — the job belongs to whoever owns the key. */
    actor?: RequestActor
}): Promise<MediaJob> {
    try {
        const res = await api.post(
            "/media/jobs",
            {
                key,
                purpose,
                upload_type: uploadType,
                ...(orgId ? { org_id: orgId } : {}),
            },
            signal || actor ? { ...(signal ? { signal } : {}), ...withActor(actor) } : undefined
        )
        return jobFrom(res.data.data)
    } catch (err) {
        if (signal?.aborted) throw new UploadError("CANCELLED")
        const refusal = asJobRefusal(err)
        if (isMediaJobError(refusal)) reportMediaJobFailure(refusal, { flow })
        throw refusal
    }
}

export async function fetchMediaJob(
    jobId: string,
    {
        orgId,
        signal,
        actor,
    }: { orgId?: string; signal?: AbortSignal; actor?: RequestActor } = {}
): Promise<MediaJob> {
    const res = await api.get(`/media/jobs/${jobId}`, {
        ...(orgId ? { params: { org_id: orgId } } : {}),
        ...(signal ? { signal } : {}),
        ...withActor(actor),
    })
    return jobFrom(res.data.data)
}

// ── Waiting for one ───────────────────────────────────────────

/** Poll fast while a short clip is likely to finish, then back off. */
const POLL_FAST_MS = 3000
const POLL_FAST_FOR_MS = 30_000
const POLL_SLOW_MS = 8000

/**
 * Past this the wait gives up on its own. The server fails a stuck job long
 * before (its sweeper), but a worker that is gone entirely fails nothing.
 */
const WAIT_CEILING_MS = 45 * 60_000

const TIMEOUT_MESSAGE = "Processing this file took too long. Try a shorter clip"

/**
 * Resolves with the READY job, or rejects with a {@link MediaJobError}
 * (the server's code and sentence), or with a cancellation when `signal`
 * aborts.
 *
 * Two sources, deliberately: the realtime bus's media_job_updated is a
 * speed-up, polling GET /media/jobs/<id> is the guarantee — every 3 s for
 * the first 30 s, then every 8 s, paused while the page is hidden and run at
 * once when it comes back or the socket reopens. Whichever answers first
 * wins; the rest is cleaned up.
 */
export function waitForMediaJob(
    jobId: string,
    {
        signal,
        onUpdate,
        orgId,
        flow = "single",
        actor,
    }: {
        signal?: AbortSignal
        onUpdate?: (job: MediaJob) => void
        orgId?: string
        flow?: UploadFlow
        /** Asked as the job's owner, whoever is active by then. */
        actor?: RequestActor
    } = {}
): Promise<MediaJob> {
    return new Promise<MediaJob>((resolve, reject) => {
        const startedAt = Date.now()
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        let inFlight = false

        const cleanup = () => {
            settled = true
            if (timer !== undefined) clearTimeout(timer)
            offJob()
            offOpen()
            signal?.removeEventListener("abort", onAbort)
            document.removeEventListener("visibilitychange", onVisibility)
        }

        const fail = (err: unknown) => {
            if (settled) return
            cleanup()
            if (err instanceof MediaJobError) reportMediaJobFailure(err, { flow })
            reject(err)
        }

        const handle = (job: MediaJob) => {
            if (settled || job?.id !== jobId) return
            onUpdate?.(job)
            if (job.status === "ready") {
                cleanup()
                resolve(job)
            } else if (job.status === "failed") {
                fail(
                    new MediaJobError(
                        job.error_code || "INTERNAL",
                        job.error_message || GENERIC_JOB_MESSAGE
                    )
                )
            }
        }

        const schedule = () => {
            if (settled) return
            if (timer !== undefined) clearTimeout(timer)
            if (document.visibilityState === "hidden") return
            const elapsed = Date.now() - startedAt
            timer = setTimeout(poll, elapsed < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS)
        }

        const poll = async () => {
            if (settled || inFlight) return
            if (Date.now() - startedAt > WAIT_CEILING_MS) {
                fail(new MediaJobError("PROCESSING_TIMEOUT", TIMEOUT_MESSAGE))
                return
            }
            inFlight = true
            try {
                handle(await fetchMediaJob(jobId, { orgId, signal, actor }))
            } catch (err) {
                if (settled || signal?.aborted) return
                // A job that is not there any more is an answer; a network
                // blip is not — the next poll asks again.
                const status = isAxiosError(err) ? err.response?.status : undefined
                if (status === 404) {
                    fail(new MediaJobError("SOURCE_MISSING", GENERIC_JOB_MESSAGE))
                    return
                }
                // Any other refusal (401, 403, 400…) will not change by
                // asking again for 45 minutes; a timeout or a rate limit may.
                if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    fail(err)
                    return
                }
            } finally {
                inFlight = false
            }
            schedule()
        }

        const onAbort = () => {
            if (settled) return
            cleanup()
            reject(new UploadError("CANCELLED"))
        }

        const onVisibility = () => {
            if (document.visibilityState === "visible") void poll()
        }

        const offJob = realtimeBus.on<{ job?: MediaJob }>("media_job_updated", (event) => {
            if (event.job) handle(event.job)
        })
        // The socket was down; whatever it missed, ask now.
        const offOpen = realtimeBus.on(REALTIME_OPEN, () => void poll())

        if (signal?.aborted) {
            onAbort()
            return
        }
        signal?.addEventListener("abort", onAbort, { once: true })
        document.addEventListener("visibilitychange", onVisibility)

        void poll()
    })
}
