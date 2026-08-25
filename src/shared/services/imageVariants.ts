/**
 * Derived copies of an image the client is about to upload.
 *
 * These used to be made on delivery — a URL transform produced any size we
 * asked for. Objects are served verbatim now, so a small copy has to be a real
 * second object, made here and uploaded alongside the full one.
 */

import imageCompression from "browser-image-compression"

/** Server cap for a "thumb" kind. The compressor targets well under it. */
export const THUMB_MAX_BYTES = 1024 * 1024

/**
 * Longest edge of a thumb. 640 covers every place one is used at 2x — a chat
 * bubble, a feed tile before the full image decodes — without being so large
 * that fetching it costs the same as the original.
 */
export const THUMB_MAX_DIMENSION = 640

const THUMB_COMPRESSION = {
    // 0.5 not 1: the ceiling is 1MB and a second pass that lands ON the limit
    // leaves no room for the container overhead. 640px of WebP is ~40-80KB in
    // practice, so this is a bound, not a target.
    maxSizeMB: 0.5,
    maxWidthOrHeight: THUMB_MAX_DIMENSION,
    initialQuality: 0.8,
    useWebWorker: true,
    fileType: "image/webp" as const,
}

/**
 * A small WebP copy of an already-compressed image.
 *
 * Deliberately a second pass over the FULL blob rather than a resize of the
 * original file: the full blob is already decoded, already WebP, and already
 * the image the user will see, so the thumb cannot drift from it.
 */
export async function makeThumb(fullBlob: Blob): Promise<File> {
    const source =
        fullBlob instanceof File
            ? fullBlob
            : new File([fullBlob], "image.webp", {
                  type: fullBlob.type || "image/webp",
              })

    const thumb = await imageCompression(source, THUMB_COMPRESSION)

    return new File([thumb], "thumb.webp", {
        type: thumb.type || "image/webp",
    })
}

/**
 * Intrinsic pixel size of an image blob.
 *
 * The backend stopped reading dimensions off the provider when it stopped being
 * the provider, so the client is now the only source. Without them a feed tile
 * has no aspect ratio to reserve and the timeline reflows as each image lands.
 *
 * Best-effort by design: resolves to zeros rather than rejecting, so a browser
 * that refuses to decode can never fail an upload over a layout hint.
 */
export function getBlobDimensions(
    blob: Blob
): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob)
        const img = new Image()

        const finish = (width: number, height: number) => {
            URL.revokeObjectURL(url)
            resolve({ width, height })
        }

        img.onload = () => finish(img.naturalWidth, img.naturalHeight)
        img.onerror = () => finish(0, 0)
        img.src = url
    })
}
