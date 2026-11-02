/**
 * Single source of truth for which video containers Goatza accepts.
 *
 * Three unrelated surfaces (posts, highlights, chat) used to keep their own copy
 * of this list, and posts' copy was missing entirely — a user could pick an AVI,
 * wait out a 300MB upload on mobile data, and get a video no browser can play.
 *
 * Keep the file picker (`VIDEO_ACCEPT`) and the validator (`VIDEO_EXTENSIONS`)
 * in step: `accept` is a hint the user can defeat with "All Files", so the
 * extension check is the one that actually decides.
 */

/** Containers the picker accepts. A .mov is encoded to MP4 before upload. */
export const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"])

/** `accept` attribute matching {@link VIDEO_EXTENSIONS} (quicktime = .mov). */
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm"

/** Rejection message — same wording on every surface. */
export const VIDEO_FORMAT_MESSAGE = "Videos must be MP4, MOV or WebM."

/**
 * Containers accepted when the server can convert what the phone cannot
 * (mediaCapabilities.ts): anything outside {@link VIDEO_EXTENSIONS} goes up as
 * the original and the media worker makes the MP4. Mirrors the backend's
 * SOURCE_VIDEO_CONTENT_TYPES.
 */
export const VIDEO_EXTENSIONS_SERVER = new Set(["mp4", "mov", "m4v", "webm", "3gp", "mkv", "avi"])

/** With the server converting, the format is rarely the problem. */
export const VIDEO_FORMAT_MESSAGE_SERVER = "This video format isn't supported."

/**
 * Extension gate for a picked file. Returns null when the file is acceptable.
 * An extension-less name passes: the mime check upstream already had its say,
 * and blocking a legitimate upload over a missing suffix is the worse failure.
 *
 * `serverProcessing` widens the gate to {@link VIDEO_EXTENSIONS_SERVER}; off
 * (the default) it is exactly today's rule and message.
 */
export function checkVideoExtension(
    fileName: string,
    { serverProcessing = false }: { serverProcessing?: boolean } = {}
): string | null {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
    if (!ext) return null
    if (serverProcessing) {
        return VIDEO_EXTENSIONS_SERVER.has(ext) ? null : VIDEO_FORMAT_MESSAGE_SERVER
    }
    return VIDEO_EXTENSIONS.has(ext) ? null : VIDEO_FORMAT_MESSAGE
}

/** The picker's `accept` for videos: anything when the server converts. */
export function videoAcceptFor(serverProcessing: boolean): string {
    return serverProcessing ? "video/*" : VIDEO_ACCEPT
}

// ── Photos ────────────────────────────────────────────────────

/**
 * PICK-TIME ceiling for a photo, checked before anything is decoded.
 *
 * Not the server's limit. The server caps the COMPRESSED file at 5 MB
 * ({@link MAX_COMPRESSED_IMAGE_BYTES}); every flow compresses well under
 * that before it signs anything. A modern phone writes 6–12 MB stills (a
 * 48 MP iPhone photo is more), and the compressor brings those to a couple
 * of MB, so gating the PICK at 5 MB refused normal photos the app handles
 * perfectly. This only refuses a file nobody should wait on.
 */
export const MAX_RAW_IMAGE_MB = 25

/** The server's cap on one compressed image, for every upload type (POLICY). */
export const MAX_COMPRESSED_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Extensions a photo is recognised by when the browser gives it no type.
 *
 * Windows Chrome reports a `.heic` as `""`, and so does any browser for an
 * extension the OS has no MIME mapping for. HEIC/HEIF is converted to JPEG
 * where the browser cannot decode it (see `compressImage` in imageVariants.ts).
 */
export const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"])

/** Rejection message for a photo over {@link MAX_RAW_IMAGE_MB} — every surface. */
export const IMAGE_TOO_LARGE_MESSAGE = `Photos must be under ${MAX_RAW_IMAGE_MB} MB.`

/** Lower-cased extension of a file name, or "" when it has none. */
export function fileExtension(fileName: string): string {
    const dot = fileName.lastIndexOf(".")
    return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : ""
}

/**
 * Is this a photo? Its MIME type says so, or — when the browser gave it no
 * usable type — its extension does. A typed non-image (a PDF, a video) is
 * never let through on its name alone.
 */
export function isImageFile(file: File): boolean {
    if (file.type.startsWith("image/")) return true
    const untyped = file.type === "" || file.type === "application/octet-stream"
    return untyped && IMAGE_EXTENSIONS.has(fileExtension(file.name))
}

/**
 * Size gate for a picked photo. Returns null when it is acceptable, otherwise
 * {@link IMAGE_TOO_LARGE_MESSAGE}. Type is each surface's own check (their
 * wording differs); pair this with {@link isImageFile}.
 */
export function checkRawImageSize(file: File): string | null {
    return file.size > MAX_RAW_IMAGE_MB * 1024 * 1024 ? IMAGE_TOO_LARGE_MESSAGE : null
}
