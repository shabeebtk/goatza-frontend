import imageCompression from "browser-image-compression"

import { getBlobDimensions, makeThumb } from "@/shared/services/imageVariants"
import {
    describeBlob,
    getUploadConfigApi,
    putToR2,
    type UploadFileDescriptor,
} from "@/shared/services/mediaUpload"
import {
    capturePoster,
    encodeVideo,
    videoProgressSplit,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"
import { checkVideoExtension } from "@/shared/constants/media"

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
     * provider when it stopped being Cloudinary, and without them a feed tile
     * has no aspect ratio to reserve.
     */
    width?: number
    height?: number
    size_bytes?: number
    order: number
}

// ── Constants ─────────────────────────────────────────────────

export const MAX_IMAGES = 10
export const MAX_IMAGE_MB = 5

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
 * through a decode that was never going to fit.
 */
export const MAX_RAW_VIDEO_MB = 300

export const MAX_VIDEO_SECONDS = 5 * 60   // 5 minutes

const IMAGE_COMPRESSION_OPTIONS = {
    // Keep good quality — feed photos are viewed large and zoomed in the
    // fullscreen viewer, so allow a higher size ceiling and resolution.
    maxSizeMB: 2.5,
    maxWidthOrHeight: 2560,
    initialQuality: 0.9,
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
        if (files[0].size > MAX_RAW_VIDEO_MB * 1024 * 1024)
            return `Video must be under ${MAX_RAW_VIDEO_MB} MB.`
        // `video/*` alone is not enough: an AVI reports a perfectly valid video
        // mime and nothing here can decode it, so without this the user waits
        // through a doomed encode to be told at the end. A .mov IS accepted —
        // it is encoded to H.264/MP4 before upload, never stored raw.
        const badFormat = checkVideoExtension(files[0].name)
        if (badFormat) return badFormat
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

// ── Upload every file of one post ─────────────────────────────

/**
 * Compress → thumb → ONE config request → PUT each object → return the media
 * payload.
 *
 * Why one config request for the whole post: `temp_post_id` names the folder
 * every object of a not-yet-created post lands in, and the server mints a fresh
 * one per request. Asking per file would scatter a 10-image carousel across 10
 * folders — which breaks the server's same-folder rule binding a thumbnail to
 * its image, and leaves nothing for the eventual cleanup sweep to delete by
 * prefix. So every blob is declared up front, images interleaved with their own
 * thumbs, and the response comes back in that exact order:
 *
 *     files:   [img0, thumb0, img1, thumb1, …]
 *     uploads: [ e0 ,   e1  ,  e2 ,   e3  , …]      image i → 2i, thumb i → 2i+1
 *
 * `order` still carries the position the user arranged, independent of upload
 * order.
 */
export async function uploadMediaFile(
    files: File[],
    onProgress?: (
        index: number,
        loaded: number,
        total: number,
        phase?: VideoUploadPhase
    ) => void
): Promise<MediaUploadResult[]> {
    if (!files.length) return []

    // `validateMediaFiles` has already refused a mixed batch, so a video here
    // means exactly one file and no images.
    if (files[0].type.startsWith("video/")) {
        return [await uploadPostVideo(files[0], onProgress)]
    }

    // ── 1. Compress + derive a thumb for every image, in order ──
    const prepared: {
        full: File
        thumb: File
        width: number
        height: number
    }[] = []

    for (const file of files) {
        const compressed = await imageCompression(file, IMAGE_COMPRESSION_OPTIONS)
        const full = new File([compressed], file.name, { type: compressed.type })
        const thumb = await makeThumb(full)
        const dims = await getBlobDimensions(full)

        prepared.push({
            full,
            thumb,
            width: dims.width,
            height: dims.height,
        })
    }

    // ── 2. One config request for the whole post ──
    const descriptors: UploadFileDescriptor[] = prepared.flatMap((p) => [
        describeBlob(p.full, "image"),
        describeBlob(p.thumb, "thumb"),
    ])

    const res = await getUploadConfigApi("posts", descriptors)
    const uploads = res.uploads

    if (!uploads || uploads.length !== descriptors.length) {
        throw new Error("Upload config mismatch")
    }

    // ── 3. PUT every object ──
    const results: MediaUploadResult[] = []

    for (let i = 0; i < prepared.length; i++) {
        const { full, thumb, width, height } = prepared[i]
        const fullEntry = uploads[i * 2]
        const thumbEntry = uploads[i * 2 + 1]

        // The full image owns the progress bar; the thumb is tens of KB and
        // would only make the bar jump backwards when it starts.
        await putToR2(full, fullEntry, (l, t) => onProgress?.(i, l, t))
        await putToR2(thumb, thumbEntry)

        results.push({
            file_url: fullEntry.public_url,
            public_id: fullEntry.key,
            media_type: "image",
            thumbnail_url: thumbEntry.public_url,
            width: width || undefined,
            height: height || undefined,
            size_bytes: full.size,
            order: i,
        })
    }

    return results
}

// ── The single video of a post ────────────────────────────────

/**
 * Encode → poster → ONE config request → PUT both.
 *
 * The video and its poster are declared in the same request for the same reason
 * images and their thumbs are: the server pairs a "video" kind with exactly one
 * "thumb" kind and requires them to land in the same folder, and `temp_post_id`
 * names one folder per request.
 */
async function uploadPostVideo(
    file: File,
    onProgress?: (
        index: number,
        loaded: number,
        total: number,
        phase?: VideoUploadPhase
    ) => void
): Promise<MediaUploadResult> {
    // Duration first, on the ORIGINAL, so a 10-minute clip is refused in the
    // time it takes to read metadata rather than after a full encode.
    const sourceDuration = await getVideoDuration(file)
    if (sourceDuration > MAX_VIDEO_SECONDS) {
        throw new Error(`Video must be under 5 minutes`)
    }

    // One bar for the whole operation: encode 0→70%, upload 70→100%.
    const { onEncode, onUpload } = videoProgressSplit((fraction, phase) =>
        onProgress?.(0, fraction * 100, 100, phase)
    )

    const encoded = await encodeVideo(file, {
        maxBytes: MAX_VIDEO_MB * 1024 * 1024,
        onProgress: onEncode,
    })

    // Poster from the ENCODED blob, not the original: it is already H.264 in an
    // MP4, so every browser can decode a frame out of it — a raw HEVC .mov is
    // exactly the file a <video> element may refuse to open.
    const poster = await capturePoster(encoded.blob, { mode: "feed" })

    const res = await getUploadConfigApi("posts", [
        describeVideo(encoded.blob),
        describeBlob(poster, "thumb"),
    ])

    const [videoEntry, posterEntry] = res.uploads ?? []
    if (!videoEntry || !posterEntry) throw new Error("Upload config mismatch")

    // The video owns the progress bar; the poster is tens of KB.
    await putToR2(encoded.blob, videoEntry, onUpload)
    await putToR2(poster, posterEntry)

    return {
        file_url: videoEntry.public_url,
        public_id: videoEntry.key,
        media_type: "video",
        thumbnail_url: posterEntry.public_url,
        // Prefer what the encoder measured; fall back to the probe for a
        // passthrough, where nothing was decoded.
        duration: Math.round(encoded.duration || sourceDuration) || undefined,
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
