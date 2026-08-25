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
 * Extension gate for a picked file. Returns null when the file is acceptable.
 * An extension-less name passes: the mime check upstream already had its say,
 * and blocking a legitimate upload over a missing suffix is the worse failure.
 */
export function checkVideoExtension(fileName: string): string | null {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
    if (ext && !VIDEO_EXTENSIONS.has(ext)) return VIDEO_FORMAT_MESSAGE
    return null
}
