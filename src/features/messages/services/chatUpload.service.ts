import imageCompression from "browser-image-compression"
import {
    getUploadSignatureApi,
    type UploadConfigItem,
} from "@/features/profile/services/upload.api"

// ── Constants ─────────────────────────────────────────────────

export const MAX_CHAT_IMAGES = 5
// Server hard limit is 10MB; we compress well under it. This gates the ORIGINAL
// the user picks, before compression, so we reject absurd files early.
export const MAX_CHAT_IMAGE_MB = 25

// Video limits mirror the backend (_validate_chat_video).
export const MAX_CHAT_VIDEO_MB = 100
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
    width?: number
    height?: number
    size_bytes?: number
}

export type ChatVideoUploadResult = ChatImageUploadResult & {
    duration_ms?: number
}

export type ChatUploadProgress = (loaded: number, total: number) => void

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
    if (file.size > MAX_CHAT_VIDEO_MB * 1024 * 1024)
        return `Video must be under ${MAX_CHAT_VIDEO_MB} MB.`
    // Mirror the backend's CHAT_VIDEO_EXTENSIONS. Without this the file uploads
    // to Cloudinary in full and only THEN gets a 400 from our own API — minutes
    // of mobile data for a rejection we could have given instantly.
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

/** Thrown when the user cancels — callers use this to stay silent. */
export const UPLOAD_CANCELLED = "upload_cancelled"

function uploadWithProgress(
    file: File,
    sig: UploadConfigItem,
    onProgress?: ChatUploadProgress,
    signal?: AbortSignal
): Promise<{
    secure_url: string
    public_id: string
    width?: number
    height?: number
    bytes?: number
    duration?: number
}> {
    const form = new FormData()
    form.append("file", file)
    form.append("api_key", sig.api_key)
    form.append("timestamp", String(sig.timestamp))
    form.append("signature", sig.signature)
    form.append("folder", sig.folder)
    form.append("public_id", sig.public_id)
    form.append("overwrite", sig.overwrite)

    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error(UPLOAD_CANCELLED))
            return
        }

        const xhr = new XMLHttpRequest()

        const onCancel = () => xhr.abort()
        signal?.addEventListener("abort", onCancel, { once: true })
        const cleanupSignal = () =>
            signal?.removeEventListener("abort", onCancel)

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) onProgress?.(e.loaded, e.total)
        })

        xhr.addEventListener("loadend", cleanupSignal)

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // A throw in here would escape the executor and leave this
                // promise permanently unsettled — the bubble would sit at 99%
                // forever with no error.
                try {
                    const data = JSON.parse(xhr.responseText)
                    resolve({
                        secure_url: data.secure_url,
                        public_id: data.public_id,
                        width: data.width,
                        height: data.height,
                        bytes: data.bytes,
                        duration: data.duration,
                    })
                } catch {
                    reject(new Error("Upload response was not readable"))
                }
            } else {
                reject(new Error("Upload failed"))
            }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error")))
        xhr.addEventListener("abort", () => reject(new Error(UPLOAD_CANCELLED)))
        xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")))

        xhr.open("POST", sig.upload_url)
        // Videos are uploaded uncompressed over mobile data; generous, but never
        // unbounded — an unbounded request can hang the bubble indefinitely.
        xhr.timeout = 10 * 60 * 1000
        xhr.send(form)
    })
}

// ── Public: compress → sign → upload one chat image ───────────

/**
 * Compresses `file`, gets a chat-scoped signature (the active actor's chat
 * folder — the axios interceptor attaches X-Actor headers, so acting as an org
 * signs into chat/organizations/…), and direct-uploads to Cloudinary.
 * width/height/bytes come from Cloudinary's response — authoritative, no extra
 * decode.
 */
export async function uploadChatImage(
    file: File,
    onProgress?: ChatUploadProgress,
    signal?: AbortSignal
): Promise<ChatImageUploadResult> {
    const compressed = await imageCompression(file, CHAT_IMAGE_COMPRESSION)
    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    const res = await getUploadSignatureApi("chat", 1)
    const sig = res.uploads?.[0]
    if (!sig) throw new Error("Upload config missing")

    const uploaded = await uploadWithProgress(
        new File([compressed], file.name, { type: compressed.type }),
        sig,
        onProgress,
        signal
    )

    return {
        media_url: uploaded.secure_url,
        media_public_id: uploaded.public_id,
        width: uploaded.width,
        height: uploaded.height,
        size_bytes: uploaded.bytes,
    }
}

/**
 * Direct-upload a chat video (no client compression — videos are uploaded
 * as-is, Cloudinary transcodes on delivery). duration/width/height/bytes come
 * from Cloudinary's response. `localDurationSec` is a fallback if Cloudinary
 * omits duration for the raw upload.
 */
export async function uploadChatVideo(
    file: File,
    onProgress?: ChatUploadProgress,
    localDurationSec?: number,
    signal?: AbortSignal
): Promise<ChatVideoUploadResult> {
    const res = await getUploadSignatureApi("chat", 1)
    const sig = res.uploads?.[0]
    if (!sig) throw new Error("Upload config missing")

    const uploaded = await uploadWithProgress(file, sig, onProgress, signal)

    const durationSec = uploaded.duration ?? localDurationSec
    return {
        media_url: uploaded.secure_url,
        media_public_id: uploaded.public_id,
        width: uploaded.width,
        height: uploaded.height,
        size_bytes: uploaded.bytes,
        duration_ms:
            durationSec != null ? Math.round(durationSec * 1000) : undefined,
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

// ── Cloudinary sized-thumbnail transform ──────────────────────

/**
 * Insert a transformation so the bubble loads a sized, auto-format derivative
 * instead of the full original. Falls back to the original URL if the shape is
 * unexpected.
 */
export function cloudinaryThumb(url: string, width = 640): string {
    if (!url || !url.includes("/upload/")) return url
    return url.replace(
        "/upload/",
        `/upload/c_limit,w_${width},q_auto,f_auto/`
    )
}
