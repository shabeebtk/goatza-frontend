import imageCompression from "browser-image-compression"
import { getUploadSignatureApi, type UploadConfigItem } from "@/features/profile/services/upload.api"

// ── Types ─────────────────────────────────────────────────────

export type UploadProgressCallback = (loaded: number, total: number) => void

export type MediaUploadResult = {
    file_url: string
    public_id: string
    media_type: "image" | "video"
    thumbnail_url?: string    // video: Cloudinary auto-generated
    duration?: number         // video: seconds
    order: number
}

// ── Constants ─────────────────────────────────────────────────

export const MAX_IMAGES = 10
export const MAX_IMAGE_MB = 5
export const MAX_VIDEO_MB = 300
export const MAX_VIDEO_SECONDS = 5 * 60   // 5 minutes

const IMAGE_COMPRESSION_OPTIONS = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: "image/webp" as const,
}

// ── Validation ────────────────────────────────────────────────

export function validateMediaFiles(files: File[]): string | null {
    if (files.length === 0) return null

    const hasImage = files.some((f) => f.type.startsWith("image/"))
    const hasVideo = files.some((f) => f.type.startsWith("video/"))

    if (hasImage && hasVideo) return "Cannot mix images and videos in one post."

    if (hasVideo) {
        if (files.length > 1) return "Only one video is allowed per post."
        if (files[0].size > MAX_VIDEO_MB * 1024 * 1024)
            return `Video must be under ${MAX_VIDEO_MB} MB.`
    }

    if (hasImage) {
        if (files.length > MAX_IMAGES) return `Maximum ${MAX_IMAGES} images allowed.`
        for (const f of files) {
            if (!f.type.startsWith("image/"))
                return `Only image files are allowed (got ${f.type}).`
            if (f.size > MAX_IMAGE_MB * 1024 * 1024)
                return `Each image must be under ${MAX_IMAGE_MB} MB (${f.name} is too large).`
        }
    }

    // Reject non-image non-video
    for (const f of files) {
        if (!f.type.startsWith("image/") && !f.type.startsWith("video/"))
            return `Unsupported file type: ${f.name}`
    }

    return null
}

/** Get video duration in seconds via a temporary <video> element */
export function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement("video")
        video.preload = "metadata"
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url)
            resolve(video.duration)
        }
        video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cannot read video duration")) }
        video.src = url
    })
}

// ── Upload a single file to Cloudinary with XHR progress ──────
async function uploadWithProgress(
    file: File,
    sig: UploadConfigItem,
    onProgress: UploadProgressCallback
): Promise<{ secure_url: string; public_id: string; duration?: number }> {
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
            if (e.lengthComputable) onProgress(e.loaded, e.total)
        })

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText)
                resolve({
                    secure_url: data.secure_url,
                    public_id: data.public_id,
                    duration: data.duration ? Math.round(data.duration) : undefined,
                })
            } else {
                reject(new Error(`Upload failed: ${xhr.statusText}`))
            }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error")))
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

        xhr.open("POST", sig.upload_url)
        xhr.send(form)
    })
}

// ── Upload one media item ─────────────────────────────────────
export async function uploadMediaFile(
    files: File[],
    onProgress?: (index: number, loaded: number, total: number) => void
): Promise<MediaUploadResult[]> {
    if (!files.length) return []

    // 🔥 1. Get batch signature
    const res = await getUploadSignatureApi("posts", files.length)

    const uploads = res.uploads

    if (!uploads || uploads.length !== files.length) {
        throw new Error("Upload config mismatch")
    }

    const results: MediaUploadResult[] = []

    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const sig = uploads[i]

        const isVideo = file.type.startsWith("video/")

        if (isVideo) {
            // 🎥 Validate duration
            const duration = await getVideoDuration(file)
            if (duration > MAX_VIDEO_SECONDS) {
                throw new Error(`Video must be under 5 minutes`)
            }

            const uploaded = await uploadWithProgress(
                file,
                sig,
                (l, t) => onProgress?.(i, l, t)
            )

            const thumbnail =
                uploaded.secure_url.replace("/video/upload/", "/video/upload/so_0/") + ".jpg"

            results.push({
                file_url: uploaded.secure_url,
                public_id: uploaded.public_id,
                media_type: "video",
                thumbnail_url: thumbnail,
                duration: uploaded.duration ?? Math.round(duration),
                order: i,
            })
        } else {
            // 🖼️ Compress image
            const compressed = await imageCompression(file, IMAGE_COMPRESSION_OPTIONS)

            const uploaded = await uploadWithProgress(
                new File([compressed], file.name, { type: compressed.type }),
                sig,
                (l, t) => onProgress?.(i, l, t)
            )

            results.push({
                file_url: uploaded.secure_url,
                public_id: uploaded.public_id,
                media_type: "image",
                order: i,
            })
        }
    }

    return results
}