import imageCompression from "browser-image-compression"

import { getBlobDimensions, makeThumb } from "@/shared/services/imageVariants"
import {
    describeBlob,
    getUploadConfigApi,
    putToR2,
    UPLOAD_CANCELLED as SHARED_UPLOAD_CANCELLED,
    type UploadProgress,
} from "@/shared/services/mediaUpload"
import { describeVideo } from "@/features/posts/services/postUpload.service"
import {
    capturePoster,
    encodeVideo,
    videoProgressSplit,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"

// ── Constants ─────────────────────────────────────────────────

export const MAX_CHAT_IMAGES = 5
// Server hard limit is 10MB; we compress well under it. This gates the ORIGINAL
// the user picks, before compression, so we reject absurd files early.
export const MAX_CHAT_IMAGE_MB = 25

// Video limits mirror the backend (_validate_chat_video).
/**
 * POST-ENCODE ceiling, matching the server cap (POLICY: chat video 80MB).
 * The browser encodes to ~2 Mbps H.264, so a 90s clip lands near 23MB.
 */
export const MAX_CHAT_VIDEO_MB = 80

/**
 * RAW-INPUT ceiling, checked at pick time before any decode starts. Generous
 * because a 90s 4K phone clip is ~200MB and encodes to a fraction of that;
 * this only refuses a file nobody should wait on.
 */
export const MAX_RAW_CHAT_VIDEO_MB = 300

export const MAX_CHAT_VIDEO_SECONDS = 90
// Mirrors CHAT_VIDEO_EXTENSIONS in messaging/services/message_service.py.
const CHAT_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"])

// Compression target — chat photos are viewed smaller than feed posts, so a
// tighter ceiling than posts keeps uploads fast on mobile data.
const CHAT_IMAGE_COMPRESSION = {
    maxSizeMB: 2,
    maxWidthOrHeight: 2048,
    initialQuality: 0.85,
    useWebWorker: true,
    fileType: "image/webp" as const,
}

export type ChatImageUploadResult = {
    media_url: string
    media_public_id: string
    /** The 640px copy the bubble loads first. Its own object on R2. */
    thumbnail_url?: string
    width?: number
    height?: number
    size_bytes?: number
}

export type ChatVideoUploadResult = ChatImageUploadResult & {
    duration_ms?: number
}


export type ChatUploadProgress = (
    loaded: number,
    total: number,
    phase?: VideoUploadPhase
) => void

// ── Validation ────────────────────────────────────────────────

export function validateChatImages(files: File[]): string | null {
    if (files.length === 0) return null
    if (files.length > MAX_CHAT_IMAGES)
        return `You can send up to ${MAX_CHAT_IMAGES} photos at once.`

    for (const f of files) {
        if (!f.type.startsWith("image/"))
            return "Only image files can be sent here."
        if (f.size > MAX_CHAT_IMAGE_MB * 1024 * 1024)
            return `Each image must be under ${MAX_CHAT_IMAGE_MB} MB.`
    }
    return null
}

/**
 * Size/format gate for a video, checked before we read its duration. Duration
 * is enforced separately (async) after metadata loads.
 */
export function validateChatVideoFile(file: File): string | null {
    if (!file.type.startsWith("video/")) return "That file isn't a video."
    if (file.size > MAX_RAW_CHAT_VIDEO_MB * 1024 * 1024)
        return `Video must be under ${MAX_RAW_CHAT_VIDEO_MB} MB.`
    // Mirror the backend's CHAT_VIDEO_EXTENSIONS. Without this the user waits
    // through a doomed encode to be told at the end. A .mov IS accepted — it is
    // encoded to H.264/MP4 before upload, never sent raw.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (ext && !CHAT_VIDEO_EXTENSIONS.has(ext))
        return "Videos must be MP4, MOV or WebM."
    return null
}

/** Intrinsic pixel size of an image File (for reserving bubble space). */
export function getImageDimensions(
    file: File
): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve({ width: img.naturalWidth, height: img.naturalHeight })
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error("Cannot read image"))
        }
        img.src = url
    })
}

/**
 * How long to wait on a <video> element before giving up on it.
 *
 * These probes are best-effort. Mobile browsers (iOS Safari especially) can
 * leave a blob-sourced <video> in limbo — no `loadedmetadata`, no `seeked` and
 * no `error` — so an un-timed promise here hangs forever and takes the whole
 * send with it.
 */
const VIDEO_PROBE_TIMEOUT_MS = 6000

/** Duration (seconds) + intrinsic size of a video File. */
export function getVideoMeta(
    file: File
): Promise<{ durationSec: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement("video")
        video.preload = "metadata"
        video.muted = true
        video.playsInline = true

        let done = false
        const finish = (fn: () => void) => {
            if (done) return
            done = true
            window.clearTimeout(timer)
            URL.revokeObjectURL(url)
            video.removeAttribute("src")
            video.load()
            fn()
        }

        const timer = window.setTimeout(
            () => finish(() => reject(new Error("Timed out reading video"))),
            VIDEO_PROBE_TIMEOUT_MS
        )

        video.onloadedmetadata = () =>
            finish(() =>
                resolve({
                    // Normalised here so no caller ever sees NaN/Infinity.
                    durationSec: Number.isFinite(video.duration)
                        ? video.duration
                        : 0,
                    width: video.videoWidth || 0,
                    height: video.videoHeight || 0,
                })
            )
        video.onerror = () => finish(() => reject(new Error("Cannot read video")))
        video.src = url
        video.load()
    })
}

/**
 * Capture the first frame of a video File as a JPEG object URL, for the
 * optimistic bubble poster while the video uploads. Caller must revoke the URL.
 * Resolves to "" if the frame can't be grabbed (bubble falls back gracefully).
 */
export function captureVideoThumbnail(file: File): Promise<string> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement("video")
        // `auto` (not `metadata`): a poster needs a decoded FRAME, and with
        // preload="metadata" mobile browsers may never fire `loadeddata`.
        video.preload = "auto"
        video.muted = true
        video.playsInline = true

        let done = false
        const finish = (result: string) => {
            if (done) return
            done = true
            window.clearTimeout(timer)
            URL.revokeObjectURL(url)
            video.removeAttribute("src")
            video.load()
            resolve(result)
        }

        // Hard cap. This promise MUST settle: the send path waits on nothing
        // that can hang, and a missing poster is purely cosmetic (the bubble
        // falls back to a neutral box until the server thumbnail lands).
        const timer = window.setTimeout(
            () => finish(""),
            VIDEO_PROBE_TIMEOUT_MS
        )

        const grabFrame = () => {
            try {
                const canvas = document.createElement("canvas")
                canvas.width = video.videoWidth || 320
                canvas.height = video.videoHeight || 320
                const ctx = canvas.getContext("2d")
                if (!ctx) {
                    finish("")
                    return
                }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                canvas.toBlob(
                    (blob) => finish(blob ? URL.createObjectURL(blob) : ""),
                    "image/jpeg",
                    0.8
                )
            } catch {
                finish("")
            }
        }

        video.onloadeddata = () => {
            // Seek slightly in — frame 0 is often black. If the file is too
            // short to seek, or the seek is a no-op (currentTime already 0),
            // `seeked` never fires, so grab what we have instead.
            const target = Math.min(0.1, (video.duration || 0) / 2)
            if (!target) {
                grabFrame()
                return
            }
            try {
                video.currentTime = target
            } catch {
                grabFrame()
            }
        }
        video.onseeked = grabFrame
        video.onerror = () => finish("")
        video.src = url
        video.load()
    })
}

// ── Direct upload to Cloudinary with XHR progress ─────────────

/**
 * Thrown when the user cancels — callers use this to stay silent. Re-exported
 * from the shared uploader so `putToR2`'s abort and this are the same sentinel.
 */
export const UPLOAD_CANCELLED = SHARED_UPLOAD_CANCELLED

// ── Public: compress → sign → upload one chat image ───────────

/**
 * Compresses `file`, asks for a chat-scoped presigned batch (the active actor's
 * chat folder — the axios interceptor attaches X-Actor headers, so acting as an
 * org signs into chat/organizations/…), and PUTs the bytes straight to storage.
 *
 * TWO objects go up, not one: the full image and a 640px thumb. The bubble
 * loads the thumb, which used to be a Cloudinary URL transform of the original
 * — R2 serves objects verbatim, so a small copy has to actually exist.
 *
 * width/height/bytes are measured here. The upload response is empty now, so
 * there is nothing authoritative to read them back from.
 */
export async function uploadChatImage(
    file: File,
    onProgress?: ChatUploadProgress,
    signal?: AbortSignal
): Promise<ChatImageUploadResult> {
    const compressed = await imageCompression(file, CHAT_IMAGE_COMPRESSION)
    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    const thumb = await makeThumb(compressed)
    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    const dims = await getBlobDimensions(compressed)

    // One request for both objects: same order in, same order out, and the
    // server's pairing rules are checked once instead of twice.
    const res = await getUploadConfigApi("chat", [
        describeBlob(compressed, "image"),
        describeBlob(thumb, "thumb"),
    ])

    const [fullEntry, thumbEntry] = res.uploads ?? []
    if (!fullEntry || !thumbEntry) throw new Error("Upload config missing")

    // The full image owns the progress bar — the thumb is tens of KB and would
    // only make the bar jump backwards when it starts.
    await putToR2(compressed, fullEntry, onProgress as UploadProgress, signal)
    await putToR2(thumb, thumbEntry, undefined, signal)

    return {
        media_url: fullEntry.public_url,
        media_public_id: fullEntry.key,
        thumbnail_url: thumbEntry.public_url,
        width: dims.width || undefined,
        height: dims.height || undefined,
        size_bytes: compressed.size,
    }
}

/**
 * Encode the clip, capture its poster, and PUT both into one presigned batch.
 *
 * The poster is mandatory here: the send endpoint requires `thumbnail_url` for
 * a video and checks it shares the video's folder — which one config request
 * guarantees. `localDurationSec` is what the composer already probed off the
 * ORIGINAL; the encoder's own measurement wins when it has one.
 */
export async function uploadChatVideo(
    file: File,
    onProgress?: ChatUploadProgress,
    localDurationSec?: number,
    signal?: AbortSignal
): Promise<ChatVideoUploadResult> {
    // One bar: encode 0→70%, upload 70→100% — same split as posts and highlights.
    const { onEncode, onUpload } = videoProgressSplit((fraction, phase) =>
        onProgress?.(fraction * 100, 100, phase)
    )

    const encoded = await encodeVideo(file, {
        maxBytes: MAX_CHAT_VIDEO_MB * 1024 * 1024,
        onProgress: onEncode,
        signal,
    })

    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    // From the ENCODED blob — it is H.264/MP4, which every browser can decode a
    // frame out of. A raw HEVC .mov is exactly what one may refuse to open.
    const poster = await capturePoster(encoded.blob, { mode: "feed" })

    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    const res = await getUploadConfigApi("chat", [
        describeVideo(encoded.blob),
        describeBlob(poster, "thumb"),
    ])

    const [videoEntry, posterEntry] = res.uploads ?? []
    if (!videoEntry || !posterEntry) throw new Error("Upload config missing")

    // The clip owns the progress bar; the poster is a few tens of KB.
    await putToR2(encoded.blob, videoEntry, onUpload as UploadProgress, signal)
    await putToR2(poster, posterEntry, undefined, signal)

    const durationSec = encoded.duration || localDurationSec

    return {
        media_url: videoEntry.public_url,
        media_public_id: videoEntry.key,
        thumbnail_url: posterEntry.public_url,
        width: encoded.width || undefined,
        height: encoded.height || undefined,
        size_bytes: encoded.blob.size,
        duration_ms:
            durationSec != null && durationSec > 0
                ? Math.round(durationSec * 1000)
                : undefined,
    }
}

/** mm:ss from seconds, e.g. 8 → "0:08", 95 → "1:35". "" if unknown. */
export function formatDuration(totalSeconds: number): string {
    // `video.duration` is NaN before metadata loads and Infinity for streams —
    // both used to render as "NaN:NaN".
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return ""
    const s = Math.max(0, Math.round(totalSeconds))
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
}
