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

// ── Which lossy format this browser can actually write ────────

/** The two lossy formats the server signs. PNG is never chosen on purpose. */
export type LossyImageType = "image/webp" | "image/jpeg"

/**
 * Can a canvas here encode WebP?
 *
 * `canvas.toBlob(cb, "image/webp")` is a REQUEST, not a guarantee: a browser
 * with no WebP encoder — every browser on an iPhone, since they are all
 * WebKit — silently hands back a lossless PNG instead, with the quality
 * argument ignored. A detailed 720×1280 video frame as PNG is often over 1MB,
 * which is exactly the server's cap for a thumb. So the format is probed once,
 * on a tiny canvas, by checking the TYPE of the blob that comes back, and the
 * answer is cached for the page.
 */
let webpProbe: Promise<boolean> | null = null

export function canEncodeWebP(): Promise<boolean> {
    webpProbe ??= new Promise<boolean>((resolve) => {
        if (typeof document === "undefined") {
            resolve(false)
            return
        }
        try {
            const canvas = document.createElement("canvas")
            canvas.width = 2
            canvas.height = 2
            canvas.toBlob(
                (blob) => resolve(blob?.type === "image/webp"),
                "image/webp",
                0.8
            )
        } catch {
            resolve(false)
        }
    })
    return webpProbe
}

/**
 * The format to compress to here: WebP where the browser can write it, JPEG
 * everywhere else. JPEG is signed by the server, lands under the size caps at
 * the same quality settings, and plays everywhere — PNG does neither of the
 * first two for a photo or a video frame.
 */
export async function preferredImageType(): Promise<LossyImageType> {
    return (await canEncodeWebP()) ? "image/webp" : "image/jpeg"
}

const EXTENSION_BY_TYPE: Record<string, string> = {
    "image/webp": "webp",
    "image/jpeg": "jpg",
    "image/png": "png",
}

/**
 * `name` with its extension swapped for the one matching `type`. The object
 * key's extension comes from the signed content type, so a File whose name
 * says `.webp` while its bytes are JPEG would be a lie the next reader trips
 * on. Unknown types keep the original name.
 */
export function imageFileName(name: string, type: string): string {
    const ext = EXTENSION_BY_TYPE[type]
    if (!ext) return name
    const base = name.replace(/\.[^.]+$/, "") || "image"
    return `${base}.${ext}`
}

// ── Thumbs ────────────────────────────────────────────────────

const THUMB_COMPRESSION = {
    // 0.5 not 1: the ceiling is 1MB and a second pass that lands ON the limit
    // leaves no room for the container overhead. 640px of WebP is ~40-80KB in
    // practice, so this is a bound, not a target.
    maxSizeMB: 0.5,
    maxWidthOrHeight: THUMB_MAX_DIMENSION,
    initialQuality: 0.8,
    useWebWorker: true,
}

/**
 * A small lossy copy of an already-compressed image — WebP where the browser
 * can write it, JPEG otherwise (see {@link preferredImageType}).
 *
 * Deliberately a second pass over the FULL blob rather than a resize of the
 * original file: the full blob is already decoded, already compressed, and
 * already the image the user will see, so the thumb cannot drift from it.
 *
 * `signal` aborts the compressor mid-pass; it rejects with `signal.reason`.
 */
export async function makeThumb(
    fullBlob: Blob,
    signal?: AbortSignal
): Promise<File> {
    const fileType = await preferredImageType()

    const source =
        fullBlob instanceof File
            ? fullBlob
            : new File([fullBlob], imageFileName("image", fullBlob.type || fileType), {
                  type: fullBlob.type || fileType,
              })

    const thumb = await imageCompression(source, {
        ...THUMB_COMPRESSION,
        fileType,
        signal,
    })

    // The compressor reports the type it really wrote, which is what the
    // upload must declare — the PUT's Content-Type is signed.
    const type = thumb.type || fileType
    return new File([thumb], imageFileName("thumb", type), { type })
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
