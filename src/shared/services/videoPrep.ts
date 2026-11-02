/**
 * Prepare on the phone, or hand the original to the server?
 *
 * One decision per file, made the same way in every flow:
 *
 *   server_processing false → exactly what each flow did before: encodeVideo
 *                             / compressImage, errors and all.
 *   server_processing true  → the phone does only what is quick and certain
 *                             (videoEncode's `serverFallback` plan); anything
 *                             else — an unusual container, a long clip, a
 *                             browser that cannot decode it, a sound it
 *                             cannot keep, a photo it cannot open — comes back
 *                             as `{ mode: "source" }`, and the caller uploads
 *                             the ORIGINAL for the media worker (sourceUpload.ts).
 *
 * Only a file over the server's own source cap still fails here; with the
 * server on, nobody is refused because of the format.
 */

import { fileExtension } from "@/shared/constants/media"
import {
    compressImage,
    getBlobDimensions,
    imageFileName,
    isImagePrepareError,
    makeThumb,
    type ImagePrepareContext,
} from "@/shared/services/imageVariants"
import {
    ensureMediaCapabilities,
    type MediaPurpose,
} from "@/shared/services/mediaCapabilities"
import { isUploadCancellation } from "@/shared/services/apiError"
import { sourceContentType } from "@/shared/services/sourceUpload"
import { reportVideoFallbackUsed, type UploadFlow } from "@/shared/services/uploadTelemetry"
import { UploadRefusal } from "@/shared/upload/uploadRefusal"
import {
    encodeVideo,
    isVideoAudioLostError,
    isVideoPrepareError,
    type EncodeProgress,
    type EncodedVideo,
} from "@/shared/services/videoEncode"

/**
 * Containers the browser may prepare itself. Anything else (m4v, 3gp, mkv,
 * avi…) goes to the server untouched, before a byte is decoded here.
 */
const BROWSER_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"])

const MB = 1024 * 1024

export type VideoPrepResult =
    | { mode: "ready"; encoded: EncodedVideo }
    | { mode: "source" }

export type PrepareVideoOptions = {
    purpose: MediaPurpose
    /** The post-encode cap for this surface (post 80 MB, highlight 40 MB…). */
    maxBytes: number
    flow: UploadFlow
    signal?: AbortSignal
    onProgress?: EncodeProgress
    allowSilentAudio?: boolean
}

/**
 * The video, ready to upload as it is — or `{ mode: "source" }` when the
 * server should convert the original instead. See the module comment.
 *
 * With the server off this IS encodeVideo: the same result, the same errors
 * (VideoPrepareError, VideoAudioLostError, the cancel sentinel), unchanged.
 */
export async function prepareVideoForUpload(
    file: File,
    { maxBytes, flow, signal, onProgress, allowSilentAudio }: PrepareVideoOptions
): Promise<VideoPrepResult> {
    const capabilities = await ensureMediaCapabilities()

    if (!capabilities.server_processing) {
        return {
            mode: "ready",
            encoded: await encodeVideo(file, { maxBytes, onProgress, signal, allowSilentAudio, flow }),
        }
    }

    const fitsSource =
        file.size <= capabilities.limits.source_video_bytes && sourceContentType(file) !== null

    // 1. A container the browser does not even try.
    const extension = fileExtension(file.name)
    if (extension && !BROWSER_VIDEO_EXTENSIONS.has(extension)) {
        if (!fitsSource) {
            throw new UploadRefusal(
                `Video must be under ${Math.round(capabilities.limits.source_video_bytes / MB)} MB.`
            )
        }
        reportServerFallback(file, flow, `container .${extension}`)
        return { mode: "source" }
    }

    // 2. The quick, certain steps only — the rest exist for when nothing
    //    could convert the file once it left the phone.
    try {
        return {
            mode: "ready",
            encoded: await encodeVideo(file, {
                maxBytes,
                onProgress,
                signal,
                allowSilentAudio,
                flow,
                serverFallback: true,
            }),
        }
    } catch (err) {
        if (signal?.aborted || isUploadCancellation(err)) throw err

        // 3. Anything the phone could not do, the server can — the sound
        //    included, so "post without sound?" is never asked here.
        const handOver = isVideoPrepareError(err) || isVideoAudioLostError(err)
        if (!handOver || !fitsSource) throw err

        if (isVideoPrepareError(err)) {
            reportVideoFallbackUsed("server", err.facts, flow, err.steps)
        } else {
            reportServerFallback(file, flow, "audio could not be kept")
        }
        return { mode: "source" }
    }
}

/** `reportVideoFallbackUsed("server")` for a decision made before any probe. */
function reportServerFallback(file: File, flow: UploadFlow, reason: string) {
    reportVideoFallbackUsed(
        "server",
        { fileType: file.type, extension: fileExtension(file.name), size: file.size },
        flow,
        [{ name: "server", outcome: "ok", reason, ms: 0 }]
    )
}

// ── Photos ────────────────────────────────────────────────────

export type ImagePrepResult =
    | { mode: "ready"; full: File; thumb: File; width: number; height: number }
    | { mode: "source" }

/**
 * compressImage + makeThumb exactly as the flows do today — or, when the
 * browser cannot open or shrink the photo (an ImagePrepareError) and the
 * server can, `{ mode: "source" }`. Any other failure propagates unchanged.
 *
 * Capabilities are only consulted on a failure, so the normal path costs
 * nothing extra. The failure is still reported by compressImage — which
 * photos the browser cannot handle is worth knowing either way.
 *
 * `thumbMaxDimension` is makeThumb's own: a recruitment poster's "thumb" is
 * the picture itself, built at 1080. A server-made thumb is always 640.
 */
export async function prepareImageForUpload(
    file: File,
    compressOptions: Parameters<typeof compressImage>[1],
    ctx: ImagePrepareContext,
    { thumbMaxDimension }: { thumbMaxDimension?: number } = {}
): Promise<ImagePrepResult> {
    try {
        const compressed = await compressImage(file, compressOptions, ctx)
        if (ctx.signal?.aborted) throw ctx.signal.reason
        const type = compressed.type || compressOptions.fileType || "image/jpeg"
        const full = new File([compressed], imageFileName(file.name, type), { type })
        const thumb = await makeThumb(full, ctx.signal, thumbMaxDimension)
        const { width, height } = await getBlobDimensions(full)
        return { mode: "ready", full, thumb, width, height }
    } catch (err) {
        if (!isImagePrepareError(err)) throw err

        const capabilities = await ensureMediaCapabilities()
        const fitsSource =
            capabilities.server_processing &&
            file.size <= capabilities.limits.source_image_bytes &&
            sourceContentType(file) !== null
        if (!fitsSource) throw err

        return { mode: "source" }
    }
}

// ── Duration ──────────────────────────────────────────────────

/**
 * How long a <video> element gets to report metadata. Mobile browsers (iOS
 * Safari especially) can leave a blob-sourced element in limbo — no
 * `loadedmetadata`, no `error` — so an un-timed read hangs the flow forever.
 * The same bound chat's getVideoMeta uses.
 */
export const VIDEO_DURATION_TIMEOUT_MS = 6000

/**
 * Seconds, via a temporary <video>. Rejects when the browser cannot read it
 * or does not answer within {@link VIDEO_DURATION_TIMEOUT_MS}.
 */
export function readVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement("video")
        video.preload = "metadata"
        video.muted = true
        video.playsInline = true

        let done = false
        const finish = (settle: () => void) => {
            if (done) return
            done = true
            window.clearTimeout(timer)
            URL.revokeObjectURL(url)
            video.removeAttribute("src")
            video.load()
            settle()
        }

        const timer = window.setTimeout(
            () => finish(() => reject(new Error("Cannot read video duration"))),
            VIDEO_DURATION_TIMEOUT_MS
        )

        video.onloadedmetadata = () => finish(() => resolve(video.duration))
        video.onerror = () => finish(() => reject(new Error("Cannot read video duration")))
        video.src = url
    })
}

export type DurationVerdict =
    /** Within the limit — or unknown, with the server deciding (VIDEO_TOO_LONG). */
    | { ok: true; seconds: number | null }
    | { ok: false; reason: "too_long"; seconds: number }
    | { ok: false; reason: "unreadable"; error: unknown }

/**
 * Is this clip short enough to start on? A duration the browser cannot read
 * is NOT a refusal while the server converts — it measures the file itself
 * and answers VIDEO_TOO_LONG — and stays one when it does not.
 */
export async function checkVideoDuration(
    file: File,
    maxSeconds: number
): Promise<DurationVerdict> {
    let seconds: number
    try {
        seconds = await readVideoDuration(file)
    } catch (error) {
        const capabilities = await ensureMediaCapabilities()
        return capabilities.server_processing
            ? { ok: true, seconds: null }
            : { ok: false, reason: "unreadable", error }
    }

    // A fragmented / streaming MP4 reports Infinity: not measurable here.
    if (!Number.isFinite(seconds)) return { ok: true, seconds: null }
    if (seconds > maxSeconds) return { ok: false, reason: "too_long", seconds }
    return { ok: true, seconds }
}
