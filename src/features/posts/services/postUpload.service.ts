import { isAxiosError } from "axios"

import type { RequestActor } from "@/core/api/axios"
import { preferredImageType } from "@/shared/services/imageVariants"
import {
    UPLOAD_CANCELLED,
    describeBlob,
    getUploadConfigApi,
    putVideoFor,
    uploadSignedBatch,
    type MediaUploadType,
    type UploadConfigResponse,
    type UploadFileDescriptor,
    type UploadProgress,
    type UploadProgressMeta,
} from "@/shared/services/mediaUpload"
import {
    VIDEO_PREPARE_FAILED_MESSAGE,
    capturePoster,
    videoProgressSplit,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"
import { isUploadCancellation } from "@/shared/services/apiError"
import { createMediaJob, uploadSource } from "@/shared/services/sourceUpload"
import {
    checkVideoDuration,
    prepareImageForUpload,
    prepareVideoForUpload,
    readVideoDuration,
    type ImagePrepResult,
} from "@/shared/services/videoPrep"
import {
    MAX_RAW_IMAGE_MB,
    checkRawImageSize,
    checkVideoExtension,
    isImageFile,
} from "@/shared/constants/media"
import { UploadRefusal } from "@/shared/upload/retryable"
import type { QueueRunContext, QueueRunOutcome } from "@/store/uploadQueue.store"
import {
    submitPostApi,
    type PostMediaJobPayload,
    type SubmitPostPayload,
} from "./posts.api"

// ── Types ─────────────────────────────────────────────────────

export type UploadProgressCallback = (loaded: number, total: number) => void

/** Re-exported so the modal can label the encode half of the bar. */
export type { VideoUploadPhase }

export type MediaUploadResult = {
    file_url: string
    public_id: string
    media_type: "image" | "video"
    /** The 640px copy uploaded alongside this image, as its own object. */
    thumbnail_url?: string
    duration?: number         // video: seconds
    /**
     * Measured client-side. The server stopped reading dimensions off the
     * provider, and without them a feed tile
     * has no aspect ratio to reserve.
     */
    width?: number
    height?: number
    size_bytes?: number
    order: number
}

/**
 * One item of a post's media: a file uploaded as it is, or an original the
 * server is converting, named by its job (shared/services/sourceUpload.ts).
 */
export type PostUploadMedia = MediaUploadResult | PostMediaJobPayload

/**
 * A post handed to the upload queue: the files the author picked (cropped),
 * kept in memory so Retry needs no re-pick, and the create body without its
 * media.
 */
export type PostDraft = {
    files: File[]
    payload: Omit<SubmitPostPayload, "media">
}

// ── Constants ─────────────────────────────────────────────────

export const MAX_IMAGES = 10

/**
 * PICK-TIME ceiling per photo — the shared {@link MAX_RAW_IMAGE_MB}. The
 * server's 5 MB cap is on the COMPRESSED file, which lands near 2.5 MB; a
 * 6–12 MB phone photo used to be refused here before it was ever compressed.
 */
export const MAX_IMAGE_MB = MAX_RAW_IMAGE_MB

/**
 * POST-ENCODE ceiling, and the server's own cap (POLICY: posts video 80MB).
 * The browser encodes to ~2 Mbps H.264, so a full 5-minute clip lands around
 * 75MB — this is the bound that encode output is checked against, not the file
 * the user picked.
 */
export const MAX_VIDEO_MB = 80

/**
 * RAW-INPUT ceiling, checked before any work starts.
 *
 * Generous on purpose: a 3-minute 4K iPhone clip is ~250MB and encodes down to
 * well under 80MB, so gating the PICK at 80 would reject videos the app handles
 * perfectly. The point is only to refuse a 2GB file before someone waits
 * through a decode that was never going to fit. The server's source cap for
 * an original it converts is the same 300MB.
 */
export const MAX_RAW_VIDEO_MB = 300

export const MAX_VIDEO_SECONDS = 5 * 60   // 5 minutes

/** Said at pick time and, should a clip slip past that, by the upload. */
export const VIDEO_TOO_LONG_MESSAGE = "Video must be under 5 minutes"

/**
 * Feed photos are viewed large and zoomed in the fullscreen viewer, so this
 * allows a higher size ceiling and resolution than chat does. The output
 * format is decided per browser (`preferredImageType`): WebP where the canvas
 * can write it, JPEG otherwise — asking an iPhone for WebP quietly yields a
 * PNG several times the size, with `maxSizeMB` unable to do anything about it.
 */
const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 2.5,
    maxWidthOrHeight: 2560,
    initialQuality: 0.9,
    useWebWorker: true,
}

/**
 * Photos: this much of the bar is preparing them, the rest is the bytes.
 * Compressing a phone photo is quick next to sending it on mobile data.
 */
const IMAGE_PREPARE_SHARE = 0.2

/**
 * What the author sees when the signature request refuses the photos the
 * client prepared — a client bug, not the author's. A photo that cannot be
 * DECODED or COMPRESSED under the cap fails earlier, with a coded
 * `ImagePrepareError` (imageVariants.ts) instead.
 */
export const PHOTOS_PREPARE_FAILED_MESSAGE =
    "Couldn't prepare these photos. Please try again."

// ── Validation ────────────────────────────────────────────────

/**
 * The composer's checks, at pick time and again on Post. `serverProcessing`
 * (mediaCapabilities.ts) widens the video formats to the ones the server can
 * convert; off, it is exactly the rule the app always had.
 */
export function validateMediaFiles(
    files: File[],
    { serverProcessing = false }: { serverProcessing?: boolean } = {}
): string | null {
    if (files.length === 0) return null

    // By type, or by extension when the browser gave none (a .heic on Windows).
    const hasImage = files.some(isImageFile)
    const hasVideo = files.some((f) => f.type.startsWith("video/"))

    if (hasImage && hasVideo) return "Cannot mix images and videos in one post."

    if (hasVideo) {
        if (files.length > 1) return "Only one video is allowed per post."
        if (files[0].size > MAX_RAW_VIDEO_MB * 1024 * 1024)
            return `Video must be under ${MAX_RAW_VIDEO_MB} MB.`
        // `video/*` alone is not enough: an AVI reports a perfectly valid video
        // mime and nothing here can decode it, so without this the user waits
        // through a doomed encode to be told at the end. A .mov IS accepted —
        // it is encoded to H.264/MP4 before upload, never stored raw. With the
        // server converting, an AVI is fine too: it goes up as the original.
        const badFormat = checkVideoExtension(files[0].name, { serverProcessing })
        if (badFormat) return badFormat
    }

    if (hasImage) {
        if (files.length > MAX_IMAGES) return `Maximum ${MAX_IMAGES} images allowed.`
        for (const f of files) {
            if (!isImageFile(f))
                return `Only image files are allowed (got ${f.type || f.name}).`
            const tooLarge = checkRawImageSize(f)
            if (tooLarge) return tooLarge
        }
    }

    // Reject non-image non-video
    for (const f of files) {
        if (!isImageFile(f) && !f.type.startsWith("video/"))
            return `Unsupported file type: ${f.name}`
    }

    return null
}

/**
 * Video duration in seconds via a temporary <video> element — rejecting after
 * 6 s, the bound chat's getVideoMeta has always had, instead of hanging the
 * post on a phone that never answers. `checkVideoDuration` (videoPrep.ts)
 * adds the server-processing rule on top: unreadable is not a refusal there.
 */
export function getVideoDuration(file: File): Promise<number> {
    return readVideoDuration(file)
}

// ── Cancellation ──────────────────────────────────────────────

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)
}

// ── Signing ───────────────────────────────────────────────────

/**
 * The ONE config request for a post's batch, with a 400 translated for the
 * author.
 *
 * Every rule the signature endpoint enforces — content types, the 1MB thumb
 * cap, the 80MB video cap, video↔thumb pairing — is met by the client before
 * the request is made, so a 400 here means the CLIENT prepared something the
 * server will not take, not something the author can change by editing their
 * post. "Thumbnail is larger than 1MB" is true and useless to them; what they
 * can do is try again. The server's own message is kept in development so the
 * actual rule that fired is not lost.
 *
 * `tempPostId` is set when `uploadSignedBatch` re-signs the rest of a batch,
 * so the new keys land in the folder the first request named. `actor` is the
 * account the post was written as (axios.ts, RequestActor).
 */
async function signPostBatch(
    type: MediaUploadType,
    files: UploadFileDescriptor[],
    signal: AbortSignal | undefined,
    prepareFailedMessage: string,
    tempPostId: string | undefined,
    actor: RequestActor
): Promise<UploadConfigResponse> {
    try {
        return await getUploadConfigApi(type, files, undefined, signal, tempPostId, actor)
    } catch (err) {
        if (isUploadCancellation(err)) throw err
        if (isAxiosError(err) && err.response?.status === 400) {
            if (process.env.NODE_ENV === "development") {
                console.warn("[postUpload] signature request refused", err.response.data)
            }
            throw new Error(prepareFailedMessage)
        }
        throw err
    }
}

// ── A queued post, start to finish ────────────────────────────

/**
 * Everything a post does after the author tapped Post — the upload queue's
 * `run` (shared/upload/uploadQueue.ts): its media prepared on the phone or
 * handed to the server (videoPrep.ts), uploaded, then the create.
 *
 *   200 → done: every file was ready, the post exists.
 *   202 → processing: the server holds the post until its conversions are
 *         done, then publishes it itself; the queue waits for that.
 *
 * EVERY request carries `ctx.actor` — the author may switch account while
 * this runs, and an org's post must still be signed and created as the org.
 */
export async function runPostUpload(
    draft: PostDraft,
    ctx: QueueRunContext
): Promise<QueueRunOutcome> {
    const media = await uploadPostMedia(draft.files, ctx)
    throwIfAborted(ctx.signal)

    ctx.setStatus("publishing")
    const result = await submitPostApi(
        {
            ...draft.payload,
            ...(media.length > 0 ? { media } : {}),
        },
        ctx.actor
    )

    return result.kind === "pending"
        ? { kind: "processing", publication: result.publication }
        : { kind: "done", result: { postId: result.postId } }
}

// ── Upload every file of one post ─────────────────────────────

/**
 * Prepare → ONE config request → PUT each object → the media payload, in the
 * order the author arranged it.
 *
 * Why one config request for the whole post: `temp_post_id` names the folder
 * every object of a not-yet-created post lands in, and the server mints a fresh
 * one per request. Asking per file would scatter a 10-image carousel across 10
 * folders — which breaks the server's same-folder rule binding a thumbnail to
 * its image, and leaves nothing for the eventual cleanup sweep to delete by
 * prefix. So every ready blob is declared up front, images interleaved with
 * their own thumbs, and the response comes back in that exact order:
 *
 *     files:   [img0, thumb0, img1, thumb1, …]
 *     uploads: [ e0 ,   e1  ,  e2 ,   e3  , …]      image i → 2i, thumb i → 2i+1
 *
 * A photo the phone cannot prepare (and the server can) goes up afterwards as
 * the ORIGINAL, into that same folder, and is named by its media job:
 * `{media_job_id, order}`. A carousel can mix the two; `order` keeps the
 * position the author arranged either way.
 *
 * `uploadSignedBatch` owns the PUTs: if the URLs run out, or R2 refuses one,
 * part-way through a 20-PUT batch, it re-signs the files that are left into
 * the SAME folder (via `temp_post_id`) and carries on, so the results below
 * are built from the entries that were ACTUALLY uploaded to.
 *
 * `ctx.signal` cancels at any point; everything then rejects with a
 * cancellation (`isUploadCancellation` in apiError.ts), which the queue treats
 * as silence, not failure.
 */
export async function uploadPostMedia(
    files: File[],
    ctx: QueueRunContext
): Promise<PostUploadMedia[]> {
    if (!files.length) return []
    throwIfAborted(ctx.signal)

    // `validateMediaFiles` has already refused a mixed batch, so a video here
    // means exactly one file and no images.
    if (files[0].type.startsWith("video/")) {
        return [await uploadPostVideo(files[0], ctx)]
    }
    return uploadPostImages(files, ctx)
}

async function uploadPostImages(
    files: File[],
    ctx: QueueRunContext
): Promise<PostUploadMedia[]> {
    const { signal } = ctx

    // ── 1. Prepare every photo, in order ──
    // Converts a HEIC this browser cannot decode, holds the result to the
    // server's 5 MB cap, and turns every failure into a coded, reported
    // ImagePrepareError — or, when the server can convert it, a source.
    const fileType = await preferredImageType()
    const prepared: ImagePrepResult[] = []
    for (let i = 0; i < files.length; i++) {
        ctx.setProgress((i / files.length) * IMAGE_PREPARE_SHARE)
        prepared.push(
            await prepareImageForUpload(
                files[i],
                { ...IMAGE_COMPRESSION_OPTIONS, fileType },
                { flow: "post", signal }
            )
        )
        throwIfAborted(signal)
    }

    // ── 2. Upload: the ready ones in one batch, then each original ──
    ctx.setStatus("uploading")
    const onBytes = trackBytes(
        prepared.map((p, i) => (p.mode === "ready" ? p.full.size : files[i].size)),
        (fraction, meta) =>
            ctx.setProgress(IMAGE_PREPARE_SHARE + fraction * (1 - IMAGE_PREPARE_SHARE), meta)
    )

    const media: PostUploadMedia[] = []
    let tempPostId: string | undefined

    const ready = prepared.flatMap((p, order) => (p.mode === "ready" ? [{ ...p, order }] : []))
    if (ready.length > 0) {
        const batch = await uploadSignedBatch(
            ready.flatMap((p) => [
                {
                    blob: p.full,
                    descriptor: describeBlob(p.full, "image"),
                    // The full image owns the progress bar; the thumb is tens of
                    // KB and would only make the bar jump backwards when it starts.
                    onProgress: onBytes(p.order),
                },
                { blob: p.thumb, descriptor: describeBlob(p.thumb, "thumb") },
            ]),
            {
                sign: (descriptors, resignInto) =>
                    signPostBatch(
                        "posts",
                        descriptors,
                        signal,
                        PHOTOS_PREPARE_FAILED_MESSAGE,
                        resignInto,
                        ctx.actor
                    ),
                signal,
                flow: "post",
            }
        )
        tempPostId = batch.tempPostId

        // ── 3. The media payload, from the entries actually uploaded to ──
        ready.forEach((p, n) => {
            const fullEntry = batch.entries[n * 2]
            const thumbEntry = batch.entries[n * 2 + 1]
            media[p.order] = {
                file_url: fullEntry.public_url,
                public_id: fullEntry.key,
                media_type: "image",
                thumbnail_url: thumbEntry.public_url,
                width: p.width || undefined,
                height: p.height || undefined,
                size_bytes: p.full.size,
                order: p.order,
            }
        })
    }

    for (let order = 0; order < prepared.length; order++) {
        if (prepared[order].mode !== "source") continue
        const source = await uploadPostSource(files[order], {
            signal,
            tempPostId,
            onProgress: onBytes(order),
            actor: ctx.actor,
        })
        // With no ready photo there was no batch: the first original names
        // the folder and the rest follow it.
        tempPostId = source.tempPostId ?? tempPostId
        media[order] = { media_job_id: source.jobId, order }
    }

    return media
}

/**
 * An original the phone could not prepare: up as it is, into the post's
 * folder, then handed to the media worker. The post names the job and the
 * server holds the post until the job is done.
 */
async function uploadPostSource(
    file: File,
    {
        signal,
        tempPostId,
        onProgress,
        actor,
    }: {
        signal: AbortSignal
        tempPostId?: string
        onProgress?: UploadProgress
        actor: RequestActor
    }
): Promise<{ jobId: string; tempPostId?: string }> {
    const uploaded = await uploadSource(file, {
        uploadType: "posts",
        purpose: "posts",
        tempPostId,
        signal,
        onProgress,
        flow: "post",
        actor,
    })
    const job = await createMediaJob({
        key: uploaded.key,
        purpose: "posts",
        uploadType: "posts",
        signal,
        flow: "post",
        actor,
    })
    return { jobId: job.id, tempPostId: uploaded.tempPostId }
}

/**
 * One bar across several uploads. `onBytes(i)` is item i's progress callback;
 * `report` gets the share of ALL the bytes sent so far, plus the retry state
 * of whichever PUT reported last.
 */
function trackBytes(
    sizes: number[],
    report: (fraction: number, meta?: UploadProgressMeta) => void
) {
    const sent = sizes.map(() => 0)
    const total = sizes.reduce((sum, size) => sum + size, 0) || 1
    return (index: number): UploadProgress =>
        (loaded, of, meta) => {
            sent[index] = of > 0 ? Math.min(1, loaded / of) * sizes[index] : 0
            report(sent.reduce((sum, bytes) => sum + bytes, 0) / total, meta)
        }
}

// ── The single video of a post ────────────────────────────────

/**
 * Encode → poster → ONE config request → PUT both — or, when the server is
 * converting and the phone cannot do it quickly and surely, the ORIGINAL up as
 * a source and the job named instead (videoPrep.ts decides which).
 *
 * The video and its poster are declared in the same request for the same reason
 * images and their thumbs are: the server pairs a "video" kind with exactly one
 * "thumb" kind and requires them to land in the same folder, and `temp_post_id`
 * names one folder per request.
 *
 * Above the multipart threshold the video goes up in parts, under the key this
 * batch issued for it — so it still lands in its poster's folder — and a
 * dropped connection or a locked screen costs one part, not the whole encode.
 */
async function uploadPostVideo(file: File, ctx: QueueRunContext): Promise<PostUploadMedia> {
    const { signal } = ctx

    // Duration first, on the ORIGINAL, so a 10-minute clip is refused in the
    // time it takes to read metadata rather than after a full encode. A clip
    // the browser cannot measure is the server's to measure when it converts
    // (VIDEO_TOO_LONG); with the server off it fails here, as it always did.
    const length = await checkVideoDuration(file, MAX_VIDEO_SECONDS)
    if (!length.ok) {
        if (length.reason === "too_long") throw new UploadRefusal(VIDEO_TOO_LONG_MESSAGE)
        throw length.error
    }

    throwIfAborted(signal)

    // One bar for the whole operation: encode 0→70%, upload 70→100%. The
    // upload half carries the PUT's retry state through to the bar.
    let uploadMeta: UploadProgressMeta | undefined
    let uploading = false
    const { onEncode, onUpload } = videoProgressSplit((fraction, phase) => {
        if (phase === "uploading" && !uploading) {
            uploading = true
            ctx.setStatus("uploading")
        }
        ctx.setProgress(fraction, phase === "uploading" ? uploadMeta : undefined)
    })

    // With the server off this is encodeVideo, unchanged: it rejects with
    // `VideoAudioLostError` when the sound cannot be kept and the author has
    // not agreed to post without it — the bar then offers "Post without sound".
    const prepared = await prepareVideoForUpload(file, {
        purpose: "posts",
        maxBytes: MAX_VIDEO_MB * 1024 * 1024,
        flow: "post",
        signal,
        onProgress: onEncode,
        allowSilentAudio: ctx.allowSilentAudio,
    })

    throwIfAborted(signal)

    if (prepared.mode === "source") {
        ctx.setStatus("uploading")
        const source = await uploadPostSource(file, {
            signal,
            onProgress: (loaded, total, meta) =>
                ctx.setProgress(total > 0 ? loaded / total : 0, meta),
            actor: ctx.actor,
        })
        return { media_job_id: source.jobId, order: 0 }
    }

    const encoded = prepared.encoded

    // Poster from the ENCODED blob, not the original: it is normally H.264 in
    // an MP4, so every browser can decode a frame out of it — a raw HEVC .mov
    // is exactly the file a <video> element may refuse to open. `capturePoster`
    // guarantees a lossy format under the server's thumb cap, and falls back
    // to a decoded frame, then a placeholder, rather than block the post.
    const poster = await capturePoster(encoded.blob, {
        mode: "feed",
        flow: "post",
        size: encoded,
    })

    throwIfAborted(signal)

    const {
        entries: [videoEntry, posterEntry],
    } = await uploadSignedBatch(
        [
            {
                blob: encoded.blob,
                descriptor: describeVideo(encoded.blob),
                // The video owns the progress bar; the poster is tens of KB.
                onProgress: (loaded, total, meta) => {
                    uploadMeta = meta
                    onUpload(loaded, total)
                },
                put: putVideoFor("posts", undefined, ctx.actor),
            },
            { blob: poster, descriptor: describeBlob(poster, "thumb") },
        ],
        {
            sign: (descriptors, tempPostId) =>
                signPostBatch(
                    "posts",
                    descriptors,
                    signal,
                    VIDEO_PREPARE_FAILED_MESSAGE,
                    tempPostId,
                    ctx.actor
                ),
            signal,
            flow: "post",
        }
    )

    // Prefer what the encoder measured; fall back to the probe for a
    // passthrough, where nothing was decoded. A <video> reports Infinity for
    // a fragmented/streaming MP4, which JSON would send as `null` — leave the
    // field out instead, like every other unknown.
    const duration = Math.round(encoded.duration || length.seconds || 0)

    return {
        file_url: videoEntry.public_url,
        public_id: videoEntry.key,
        media_type: "video",
        thumbnail_url: posterEntry.public_url,
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        width: encoded.width || undefined,
        height: encoded.height || undefined,
        size_bytes: encoded.blob.size,
        order: 0,
    }
}

/**
 * Descriptor for an encoded video. `describeBlob` normalises unknown types to
 * WebP (it exists for images), so the video kind builds its own — the
 * Content-Type is signed into the PUT and must match the bytes exactly.
 */
export function describeVideo(blob: Blob): UploadFileDescriptor {
    return {
        content_type: blob.type === "video/webm" ? "video/webm" : "video/mp4",
        size_bytes: blob.size,
        kind: "video",
    }
}
