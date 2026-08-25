/**
 * Direct upload for a highlight clip: validate → encode → sign → upload →
 * hand back exactly the fields `POST /highlights/` wants.
 *
 * No new media plumbing (HIGHLIGHTS_SPEC.md §2): the signature comes from the
 * existing `/user/get/upload/signature` endpoint. It has no `highlights` type
 * yet, so clips are signed as `posts` — the same user-scoped folder the
 * player's post videos use. Add a dedicated `highlights` type server-side if
 * you want them stored apart.
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
    describeBlob,
    getUploadConfigApi,
    putToR2,
} from "@/shared/services/mediaUpload"
import { describeVideo } from "@/features/posts/services/postUpload.service"
import {
    capturePoster,
    encodeVideo,
    videoProgressSplit,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"
import {
    VIDEO_EXTENSIONS,
    VIDEO_FORMAT_MESSAGE,
} from "@/shared/constants/media"

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
 * the app handles fine. This only stops someone waiting on a 2GB file.
 */
export const MAX_RAW_HIGHLIGHT_MB = 300

/**
 * What the picker accepts. Shared with posts — see
 * `@/shared/constants/media`. A .mov is encoded to MP4 before upload.
 */
const HIGHLIGHT_VIDEO_EXTENSIONS = VIDEO_EXTENSIONS

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
 */
export function validateHighlightFile(file: File): string | null {
    if (!file.type.startsWith("video/")) return "That file isn't a video."

    if (file.size > MAX_RAW_HIGHLIGHT_MB * 1024 * 1024)
        return `A highlight must be under ${MAX_RAW_HIGHLIGHT_MB} MB.`

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
 * times out must not block a legitimate upload) — the encoder measures the real
 * duration during `uploadHighlightVideo`, which re-checks the cap before a
 * single byte moves, so a clip that slips past here is still caught.
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

// ── Upload: encode → poster → presigned PUTs ─────────────────

/**
 * Encode the clip, grab its 9:16 poster, and put both objects into one
 * presigned batch.
 *
 * The poster is not optional: nothing derives one server-side any more, and
 * `POST /highlights/` requires `thumbnail_url` and checks it sits in the same
 * folder as the video — which one config request guarantees.
 *
 * `localMeta` is what the add-modal already probed off the ORIGINAL file. It is
 * only a fallback: the encoder reports the post-encode dimensions, which are
 * what actually got stored.
 */
export async function uploadHighlightVideo(
    file: File,
    options?: {
        onProgress?: HighlightUploadProgress
        signal?: AbortSignal
        localMeta?: HighlightVideoMeta | null
    }
): Promise<HighlightUploadResult> {
    const signal = options?.signal

    // One bar: encode 0→70%, upload 70→100% — the same split posts and chat use.
    const { onEncode, onUpload } = videoProgressSplit((fraction, phase) =>
        options?.onProgress?.(fraction * 100, 100, phase)
    )

    const encoded = await encodeVideo(file, {
        maxBytes: MAX_HIGHLIGHT_MB * 1024 * 1024,
        onProgress: onEncode,
        signal,
    })

    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    // Second duration gate, on what the encoder actually measured. The pick-time
    // check can come back empty when a phone's <video> probe times out, and the
    // server clamps an out-of-range duration to NULL rather than rejecting it —
    // so without this a 4-minute clip could reach the rail with no duration.
    if (encoded.duration > MAX_HIGHLIGHT_SECONDS) {
        throw new Error(tooLongMessage(encoded.duration))
    }

    // From the ENCODED blob: it is H.264/MP4, so a <video> can always decode a
    // frame out of it. A raw HEVC .mov is exactly what a browser may refuse.
    const poster = await capturePoster(encoded.blob, { mode: "highlight" })

    if (signal?.aborted) throw new Error(UPLOAD_CANCELLED)

    const res = await getUploadConfigApi("posts", [
        describeVideo(encoded.blob),
        describeBlob(poster, "thumb"),
    ])

    const [videoEntry, posterEntry] = res.uploads ?? []
    if (!videoEntry || !posterEntry) throw new Error("Upload config missing")

    // The clip owns the bar; the poster is a few tens of KB.
    await putToR2(encoded.blob, videoEntry, onUpload, signal)
    await putToR2(poster, posterEntry, undefined, signal)

    const localMeta = options?.localMeta
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
