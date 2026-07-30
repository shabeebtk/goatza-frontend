/**
 * Direct upload for a highlight clip: validate → sign → upload to Cloudinary →
 * hand back exactly the fields `POST /highlights/` wants.
 *
 * No new media plumbing (HIGHLIGHTS_SPEC.md §2): the signature comes from the
 * existing `/user/get/upload/signature` endpoint. It has no `highlights` type
 * yet, so clips are signed as `posts` — the same user-scoped Cloudinary folder
 * the player's post videos use. Add a dedicated `highlights` type to
 * `ALLOWED_TYPES` server-side if you want them stored apart.
 *
 * The video probe (`getVideoMeta`) and the cancellation sentinel are reused from
 * the chat uploader rather than written a third time — that probe carries real
 * mobile-Safari workarounds (timeouts, NaN duration) worth keeping in one place.
 */

import {
    UPLOAD_CANCELLED,
    getVideoMeta,
} from "@/features/messages/services/chatUpload.service"
import {
    getUploadSignatureApi,
    type UploadConfigItem,
} from "@/features/profile/services/upload.api"
import {
    VIDEO_EXTENSIONS,
    VIDEO_FORMAT_MESSAGE,
} from "@/shared/constants/media"
import { videoDeliveryUrl } from "@/shared/services/cloudinaryDelivery"

// ── Limits (mirror the backend) ───────────────────────────────

/** Hard server rule: HighlightService.MAX_DURATION_SECONDS. */
export const MAX_HIGHLIGHT_SECONDS = 90

/**
 * Client-only ceiling. A 90s clip from a phone lands well under this; the point
 * is to reject a 2GB pick before it burns the user's mobile data.
 */
export const MAX_HIGHLIGHT_MB = 100

/**
 * What browsers + Cloudinary both handle reliably. Shared with posts and the
 * file pickers — see `@/shared/constants/media`.
 */
const HIGHLIGHT_VIDEO_EXTENSIONS = VIDEO_EXTENSIONS

export type HighlightUploadProgress = (loaded: number, total: number) => void

export type HighlightUploadResult = {
    file_url: string
    public_id: string
    thumbnail_url: string
    /** Seconds, from Cloudinary (authoritative) or the local probe. */
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
 */
export function validateHighlightFile(file: File): string | null {
    if (!file.type.startsWith("video/")) return "That file isn't a video."

    if (file.size > MAX_HIGHLIGHT_MB * 1024 * 1024)
        return `A highlight must be under ${MAX_HIGHLIGHT_MB} MB.`

    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (ext && !HIGHLIGHT_VIDEO_EXTENSIONS.has(ext)) return VIDEO_FORMAT_MESSAGE

    return null
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
 * times out must not block a legitimate upload) — Cloudinary reports the real
 * duration on upload and the server re-checks the cap, so a clip that slips
 * past here is still rejected before it reaches the rail.
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

// ── Cloudinary delivery URLs ──────────────────────────────────

/**
 * Poster frame for the rail: first frame, JPEG, auto quality, cropped to the
 * 9:16 tile (HIGHLIGHTS_SPEC.md §2 — `so_0`, `f_jpg`, `q_auto`, ~360×640).
 * The rail must load like images, so this is what the tiles point at.
 */
export function highlightThumbnailUrl(
    cloudName: string,
    publicId: string,
    width = 360,
    height = 640
): string {
    if (!cloudName || !publicId) return ""
    return (
        `https://res.cloudinary.com/${cloudName}/video/upload/` +
        `so_0,f_jpg,q_auto,c_fill,w_${width},h_${height}/${publicId}.jpg`
    )
}

/**
 * Playback URL for a clip (§3 performance requirements). Kept as a named export
 * so the viewer keeps reading in highlights vocabulary, but the transformation
 * itself is app-wide now — see `@/shared/services/cloudinaryDelivery`.
 *
 * This used to be `q_auto,f_auto`, which left the ORIGINAL codec in place; the
 * shared transform caps resolution and forces H.264 so the clip decodes in
 * hardware on a low-end phone. Clips uploaded before this change will
 * cold-generate the new derivative on their first view — a one-time wait per
 * clip, expected and acceptable, and closed for good by the backend backfill.
 */
export function highlightVideoUrl(url: string): string {
    return videoDeliveryUrl(url)
}

// ── Direct upload to Cloudinary (XHR, progress + abort) ───────

function uploadWithProgress(
    file: File,
    sig: UploadConfigItem,
    onProgress?: HighlightUploadProgress,
    signal?: AbortSignal
): Promise<{
    secure_url: string
    public_id: string
    width?: number
    height?: number
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

        xhr.addEventListener("loadend", () =>
            signal?.removeEventListener("abort", onCancel)
        )

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) onProgress?.(e.loaded, e.total)
        })

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // A throw inside the executor would leave this promise forever
                // unsettled — the tile would sit at 99% with no error.
                try {
                    const data = JSON.parse(xhr.responseText) as {
                        secure_url: string
                        public_id: string
                        width?: number
                        height?: number
                        duration?: number
                    }
                    resolve(data)
                } catch {
                    reject(new Error("Upload response was not readable"))
                }
            } else {
                reject(new Error("Upload failed. Please try again."))
            }
        })

        xhr.addEventListener("error", () =>
            reject(new Error("Network error while uploading."))
        )
        xhr.addEventListener("abort", () => reject(new Error(UPLOAD_CANCELLED)))
        xhr.addEventListener("timeout", () =>
            reject(new Error("Upload timed out. Please try again."))
        )

        xhr.open("POST", sig.upload_url)
        // Generous for a 90s clip on mobile data, but never unbounded — an
        // unbounded request can leave the UI uploading forever.
        xhr.timeout = 10 * 60 * 1000
        xhr.send(form)
    })
}

/**
 * Sign → upload → derive the poster. Videos are sent as-is (no client
 * compression); Cloudinary transcodes on delivery. Dimensions and duration come
 * back from Cloudinary, which is authoritative — `localMeta` only fills in when
 * Cloudinary omits them.
 */
export async function uploadHighlightVideo(
    file: File,
    options?: {
        onProgress?: HighlightUploadProgress
        signal?: AbortSignal
        localMeta?: HighlightVideoMeta | null
    }
): Promise<HighlightUploadResult> {
    const res = await getUploadSignatureApi("posts", 1)
    const sig = res.uploads?.[0]
    if (!sig) throw new Error("Upload config missing")

    const uploaded = await uploadWithProgress(
        file,
        sig,
        options?.onProgress,
        options?.signal
    )

    const localMeta = options?.localMeta
    const durationSec = uploaded.duration ?? localMeta?.durationSec
    const width = uploaded.width ?? localMeta?.width
    const height = uploaded.height ?? localMeta?.height

    return {
        file_url: uploaded.secure_url,
        public_id: uploaded.public_id,
        thumbnail_url: highlightThumbnailUrl(sig.cloud_name, uploaded.public_id),
        duration:
            durationSec != null && durationSec > 0
                ? Math.round(durationSec)
                : undefined,
        width: width || undefined,
        height: height || undefined,
    }
}
