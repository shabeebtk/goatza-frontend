/**
 * Direct upload for a highlight clip: validate → encode → sign → upload →
 * create — run in the background by the upload queue
 * (shared/upload/uploadQueue.ts), not by the modal.
 *
 * No new media plumbing (HIGHLIGHTS_SPEC.md §2): the signature comes from the
 * existing `/user/get/upload/signature` endpoint. It has no `highlights` type
 * yet, so clips are signed as `posts` — the same user-scoped folder the
 * player's post videos use. Add a dedicated `highlights` type server-side if
 * you want them stored apart.
 *
 * When the server converts what the phone cannot (mediaCapabilities.ts), a
 * clip the browser cannot prepare goes up as the ORIGINAL instead and the
 * highlight names its media job; the server adds it to the rail once the job
 * is done (202).
 *
 * The video probe (`getVideoMeta`) and the cancellation sentinel are reused from
 * the chat uploader rather than written a third time — that probe carries real
 * mobile-Safari workarounds (timeouts, NaN duration) worth keeping in one place.
 */

import type { RequestActor } from "@/core/api/axios"
import {
    UPLOAD_CANCELLED,
    getVideoMeta,
} from "@/features/messages/services/chatUpload.service"
import {
    describeBlob,
    getUploadConfigApi,
    putVideoFor,
    uploadSignedBatch,
    type UploadProgressMeta,
} from "@/shared/services/mediaUpload"
import { describeVideo } from "@/features/posts/services/postUpload.service"
import {
    capturePoster,
    videoProgressSplit,
    type EncodedVideo,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"
import { prepareVideoForUpload } from "@/shared/services/videoPrep"
import { createMediaJob, uploadSource } from "@/shared/services/sourceUpload"
import { checkVideoExtension } from "@/shared/constants/media"
import { UploadRefusal } from "@/shared/upload/retryable"
import type { QueueRunContext, QueueRunOutcome } from "@/store/uploadQueue.store"
import { submitHighlightApi, type SubmitHighlightResult } from "./highlights.api"
import type { HighlightVisibility } from "../types"

// ── Limits (mirror the backend) ───────────────────────────────

/** Hard server rule: HighlightService.MAX_DURATION_SECONDS. */
export const MAX_HIGHLIGHT_SECONDS = 90

/**
 * POST-ENCODE ceiling, matching the server cap (POLICY: highlights 40MB).
 * A 90s clip at ~2 Mbps is roughly 23MB, so this has real headroom.
 */
export const MAX_HIGHLIGHT_MB = 40

/**
 * RAW-INPUT ceiling, checked at pick time before any decode starts.
 *
 * Deliberately far above the post-encode cap: a 90s 4K iPhone clip is ~200MB
 * and encodes to well under 40MB, so gating the PICK at 40 would refuse clips
 * the app handles fine. This only stops someone waiting on a 2GB file. It is
 * also the server's source cap for an original it converts.
 */
export const MAX_RAW_HIGHLIGHT_MB = 300

export type HighlightUploadProgress = (
    loaded: number,
    total: number,
    phase?: VideoUploadPhase
) => void

export type HighlightUploadResult = {
    file_url: string
    public_id: string
    thumbnail_url: string
    /** Seconds, from the encoder (authoritative) or the local probe. */
    duration?: number
    width?: number
    height?: number
}

export { UPLOAD_CANCELLED }

export const isUploadCancelled = (err: unknown): boolean =>
    err instanceof Error && err.message === UPLOAD_CANCELLED

// ── Validation ────────────────────────────────────────────────

/**
 * Cheap checks that need no decoding: mime, size, container. Duration comes
 * from `checkHighlightDuration` once metadata has loaded.
 *
 * `serverProcessing` widens the containers to the ones the server can convert
 * (a .m4v, a .3gp, an .mkv…); off, it is the MP4/MOV/WebM rule as always.
 */
export function validateHighlightFile(
    file: File,
    { serverProcessing = false }: { serverProcessing?: boolean } = {}
): string | null {
    if (!file.type.startsWith("video/")) return "That file isn't a video."

    if (file.size > MAX_RAW_HIGHLIGHT_MB * 1024 * 1024)
        return `A highlight must be under ${MAX_RAW_HIGHLIGHT_MB} MB.`

    return checkVideoExtension(file.name, { serverProcessing })
}

export const tooLongMessage = (seconds: number): string =>
    `Highlights can be at most ${MAX_HIGHLIGHT_SECONDS} seconds. ` +
    `This clip is ${Math.round(seconds)} seconds — trim it and try again.`

export type HighlightVideoMeta = {
    durationSec: number
    width: number
    height: number
}

/**
 * Read the clip's metadata and enforce the 90s cap before a single byte is
 * uploaded. `meta` is null when the browser refused to tell us (a probe that
 * times out must not block a legitimate upload) — the encoder measures the real
 * duration during the upload, which re-checks the cap before a single byte
 * moves, and the server measures an original it converts — so a clip that
 * slips past here is still caught.
 */
export async function checkHighlightDuration(
    file: File
): Promise<{ meta: HighlightVideoMeta | null; error: string | null }> {
    let meta: HighlightVideoMeta | null = null

    try {
        meta = await getVideoMeta(file)
    } catch {
        return { meta: null, error: null }
    }

    if (meta.durationSec > MAX_HIGHLIGHT_SECONDS)
        return { meta, error: tooLongMessage(meta.durationSec) }

    return { meta, error: null }
}

// ── A queued highlight, start to finish ───────────────────────

/** What the add modal hands the queue: the picked clip, in memory, and its fields. */
export type HighlightDraft = {
    file: File
    /** What the modal's pick-time probe found; a fallback for the encoder's. */
    meta: HighlightVideoMeta | null
    title?: string
    visibility?: HighlightVisibility
}

/**
 * Everything a highlight does after Add — the upload queue's `run`:
 *
 *   ready  → encode → poster → one presigned batch → create (201 → done)
 *   source → the original up as it is → media job → create naming the job
 *            (202 → the server adds it once the job is done)
 *
 * With the server off it is only the first, exactly as before — including
 * the `VideoAudioLostError` that the bar turns into "Add without sound".
 *
 * Every request carries `ctx.actor`: the player may switch account while it
 * runs, and the clip is still theirs.
 */
export async function runHighlightUpload(
    draft: HighlightDraft,
    ctx: QueueRunContext
): Promise<QueueRunOutcome> {
    const { signal } = ctx
    const fields = {
        ...(draft.title ? { title: draft.title } : {}),
        ...(draft.visibility ? { visibility: draft.visibility } : {}),
    }

    // One bar: encode 0→70%, upload 70→100% — the same split posts and chat
    // use. The upload half carries the PUT's retry state, so the bar can say
    // "Retrying… (2/4)" / "Resuming…" rather than jump back.
    let uploading = false
    let uploadMeta: UploadProgressMeta | undefined
    const { onEncode, onUpload } = videoProgressSplit((fraction, phase) => {
        if (phase === "uploading" && !uploading) {
            uploading = true
            ctx.setStatus("uploading")
        }
        ctx.setProgress(fraction, phase === "uploading" ? uploadMeta : undefined)
    })

    const prepared = await prepareVideoForUpload(draft.file, {
        purpose: "highlights",
        maxBytes: MAX_HIGHLIGHT_MB * 1024 * 1024,
        flow: "highlight",
        signal,
        onProgress: onEncode,
        allowSilentAudio: ctx.allowSilentAudio,
    })

    if (signal.aborted) throw new Error(UPLOAD_CANCELLED)

    let result: SubmitHighlightResult
    if (prepared.mode === "source") {
        // Signed as "posts" like every clip; converted for "highlights",
        // which is what holds it to 90 s and refuses a photo.
        ctx.setStatus("uploading")
        const uploaded = await uploadSource(draft.file, {
            uploadType: "posts",
            purpose: "highlights",
            signal,
            flow: "highlight",
            onProgress: (loaded, total, meta) =>
                ctx.setProgress(total > 0 ? loaded / total : 0, meta),
            actor: ctx.actor,
        })
        const job = await createMediaJob({
            key: uploaded.key,
            purpose: "highlights",
            uploadType: "posts",
            signal,
            flow: "highlight",
            actor: ctx.actor,
        })
        ctx.setStatus("publishing")
        result = await submitHighlightApi({ media_job_id: job.id, ...fields }, ctx.actor)
    } else {
        const uploaded = await uploadEncodedHighlight(prepared.encoded, {
            signal,
            localMeta: draft.meta,
            actor: ctx.actor,
            onUpload: (loaded, total, meta) => {
                uploadMeta = meta
                onUpload(loaded, total)
            },
        })
        ctx.setStatus("publishing")
        result = await submitHighlightApi({ ...uploaded, ...fields }, ctx.actor)
    }

    return result.kind === "pending"
        ? { kind: "processing", publication: result.publication }
        : { kind: "done", result: { highlightId: result.highlightId || undefined } }
}

// ── Upload: poster → presigned PUTs ───────────────────────────

/**
 * Grab the encoded clip's 9:16 poster and put both objects into one presigned
 * batch.
 *
 * The poster is not optional: nothing derives one server-side any more, and
 * `POST /highlights/` requires `thumbnail_url` and checks it sits in the same
 * folder as the video — which one config request guarantees.
 *
 * `localMeta` is what the add-modal already probed off the ORIGINAL file. It is
 * only a fallback: the encoder reports the post-encode dimensions, which are
 * what actually got stored.
 *
 * Signed as "posts", the batch gets a `temp_post_id` folder like any post, so
 * a re-sign after an expiry or a 403 names that folder and the poster stays
 * beside its clip. Above the multipart threshold the clip goes up in parts.
 */
async function uploadEncodedHighlight(
    encoded: EncodedVideo,
    {
        signal,
        localMeta,
        actor,
        onUpload,
    }: {
        signal: AbortSignal
        localMeta: HighlightVideoMeta | null
        actor: RequestActor
        onUpload: (loaded: number, total: number, meta?: UploadProgressMeta) => void
    }
): Promise<HighlightUploadResult> {
    // Second duration gate, on what the encoder actually measured. The pick-time
    // check can come back empty when a phone's <video> probe times out, and the
    // server clamps an out-of-range duration to NULL rather than rejecting it —
    // so without this a 4-minute clip could reach the rail with no duration.
    if (encoded.duration > MAX_HIGHLIGHT_SECONDS) {
        throw new UploadRefusal(tooLongMessage(encoded.duration))
    }

    // From the ENCODED blob: normally H.264/MP4, so a <video> can decode a
    // frame out of it. A raw HEVC .mov is exactly what a browser may refuse —
    // and when the element fails anyway, capturePoster decodes a frame
    // itself, then falls back to a placeholder, rather than block the clip.
    const poster = await capturePoster(encoded.blob, {
        mode: "highlight",
        flow: "highlight",
        size: encoded,
    })

    if (signal.aborted) throw new Error(UPLOAD_CANCELLED)

    const {
        entries: [videoEntry, posterEntry],
    } = await uploadSignedBatch(
        [
            {
                blob: encoded.blob,
                descriptor: describeVideo(encoded.blob),
                // The clip owns the bar; the poster is a few tens of KB.
                onProgress: (loaded, total, meta) => onUpload(loaded, total, meta),
                put: putVideoFor("posts", undefined, actor),
            },
            { blob: poster, descriptor: describeBlob(poster, "thumb") },
        ],
        {
            sign: (files, tempPostId) =>
                getUploadConfigApi("posts", files, undefined, signal, tempPostId, actor),
            signal,
            flow: "highlight",
        }
    )

    const durationSec = encoded.duration || localMeta?.durationSec
    const width = encoded.width || localMeta?.width
    const height = encoded.height || localMeta?.height

    return {
        file_url: videoEntry.public_url,
        public_id: videoEntry.key,
        thumbnail_url: posterEntry.public_url,
        duration:
            durationSec != null && durationSec > 0
                ? Math.round(durationSec)
                : undefined,
        width: width || undefined,
        height: height || undefined,
    }
}
