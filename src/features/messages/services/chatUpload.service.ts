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

/** Duration (seconds) + intrinsic size of a video File. */
export function getVideoMeta(
    file: File
): Promise<{ durationSec: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement("video")
        video.preload = "metadata"
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url)
            resolve({
                durationSec: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
            })
        }
        video.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error("Cannot read video"))
        }
        video.src = url
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
        video.preload = "metadata"
        video.muted = true
        video.playsInline = true

        const cleanup = () => URL.revokeObjectURL(url)

        video.onloadeddata = () => {
            // Seek slightly in — frame 0 is often black.
            try {
                video.currentTime = Math.min(0.1, video.duration || 0)
            } catch {
                video.currentTime = 0
            }
        }
        video.onseeked = () => {
            try {
                const canvas = document.createElement("canvas")
                canvas.width = video.videoWidth || 320
                canvas.height = video.videoHeight || 320
                const ctx = canvas.getContext("2d")
                if (!ctx) {
                    cleanup()
                    resolve("")
                    return
                }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                canvas.toBlob(
                    (blob) => {
                        cleanup()
                        resolve(blob ? URL.createObjectURL(blob) : "")
                    },
                    "image/jpeg",
                    0.8
                )
            } catch {
                cleanup()
                resolve("")
            }
        }
        video.onerror = () => {
            cleanup()
            resolve("")
        }
        video.src = url
    })
}

// ── Direct upload to Cloudinary with XHR progress ─────────────

function uploadWithProgress(
    file: File,
    sig: UploadConfigItem,
    onProgress?: ChatUploadProgress
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
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) onProgress?.(e.loaded, e.total)
        })

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText)
                resolve({
                    secure_url: data.secure_url,
                    public_id: data.public_id,
                    width: data.width,
                    height: data.height,
                    bytes: data.bytes,
                    duration: data.duration,
                })
            } else {
                reject(new Error("Upload failed"))
            }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error")))
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

        xhr.open("POST", sig.upload_url)
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
    onProgress?: ChatUploadProgress
): Promise<ChatImageUploadResult> {
    const compressed = await imageCompression(file, CHAT_IMAGE_COMPRESSION)

    const res = await getUploadSignatureApi("chat", 1)
    const sig = res.uploads?.[0]
    if (!sig) throw new Error("Upload config missing")

    const uploaded = await uploadWithProgress(
        new File([compressed], file.name, { type: compressed.type }),
        sig,
        onProgress
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
    localDurationSec?: number
): Promise<ChatVideoUploadResult> {
    const res = await getUploadSignatureApi("chat", 1)
    const sig = res.uploads?.[0]
    if (!sig) throw new Error("Upload config missing")

    const uploaded = await uploadWithProgress(file, sig, onProgress)

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

/** mm:ss from seconds, e.g. 8 → "0:08", 95 → "1:35". */
export function formatDuration(totalSeconds: number): string {
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
