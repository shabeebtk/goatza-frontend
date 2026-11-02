/**
 * Derived copies of an image the client is about to upload.
 *
 * These used to be made on delivery — a URL transform produced any size we
 * asked for. Objects are served verbatim now, so a small copy has to be a real
 * second object, made here and uploaded alongside the full one.
 *
 * Every photo flow also compresses its ORIGINAL through `compressImage` here,
 * which is where a photo the browser cannot decode (HEIC on Chrome/Firefox)
 * is converted, and where every way of failing becomes a coded, reported
 * `ImagePrepareError` instead of a bare "Couldn't prepare these photos".
 */

import imageCompression, { type Options as CompressionOptions } from "browser-image-compression"

import {
    MAX_COMPRESSED_IMAGE_BYTES,
    fileExtension,
} from "@/shared/constants/media"
import {
    reportImagePrepareFailure,
    type UploadFlow,
} from "@/shared/services/uploadTelemetry"
import type { StepRecord } from "@/shared/services/videoEncode"

/** Server cap for a "thumb" kind. The compressor targets well under it. */
export const THUMB_MAX_BYTES = 1024 * 1024

/**
 * Longest edge of a thumb. 640 covers every place one is used at 2x — a chat
 * bubble, a feed tile before the full image decodes — without being so large
 * that fetching it costs the same as the original.
 */
export const THUMB_MAX_DIMENSION = 640

/**
 * Longest edge of a thumb that is itself the picture, not a placeholder for
 * one. A recruitment cover fills the whole width of the phone on the poster
 * card: roughly a 1060px slot on a 3x screen, which a 640px copy visibly
 * cannot fill. Compressed WebP at 1080 is a couple of hundred KB — the right
 * weight for that card, and still a long way below the 2560px original.
 */
export const POSTER_THUMB_MAX_DIMENSION = 1080

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
 *
 * `maxDimension` raises the longest edge for a caller whose "thumb" is the
 * picture rather than a placeholder for one — see
 * {@link POSTER_THUMB_MAX_DIMENSION}. The 0.5MB bound is unchanged and still
 * has room at 1080: it is a ceiling under the server's 1MB cap, not a target.
 */
export async function makeThumb(
    fullBlob: Blob,
    signal?: AbortSignal,
    maxDimension: number = THUMB_MAX_DIMENSION
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
        maxWidthOrHeight: maxDimension,
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

// ── Preparing a photo: decode, compress, prove it fits ────────

export type ImagePrepareCode =
    /** The browser could not decode it, even after a HEIC → JPEG conversion. */
    | "IMAGE_DECODE_FAILED"
    /** Compressed, and still over the server's cap. */
    | "IMAGE_TOO_LARGE_AFTER_COMPRESSION"

/** The human half of each message; the code suffix is added on construction. */
const IMAGE_PREPARE_MESSAGES: Record<ImagePrepareCode, string> = {
    IMAGE_DECODE_FAILED:
        "This photo couldn't be opened on this device. Try a JPG copy of it, or a different photo",
    IMAGE_TOO_LARGE_AFTER_COMPRESSION:
        "This photo is still too large after compressing it. Try a smaller photo",
}

/** What was known about a photo that failed — measured off the file, never its name. */
export type ImageFacts = {
    fileType: string
    extension: string
    size: number
    /** HEIC/HEIF by type or extension. */
    heic: boolean
    /** The cap the compressed file was held to. */
    maxBytes?: number
    /** The compressor's output, when there was one. */
    outputBytes?: number
    /** A crop's output size, for a failure in `getCroppedBlob`. */
    width?: number
    height?: number
    userAgent?: string
}

/**
 * Every way preparing a photo ends badly, with what was tried. The message is
 * a sentence for the author ending in a code they can quote, the same shape
 * as `UploadError`'s: "… Try a smaller photo (IMAGE_TOO_LARGE_AFTER_COMPRESSION)".
 */
export class ImagePrepareError extends Error {
    readonly code: ImagePrepareCode
    readonly facts: ImageFacts
    readonly steps: StepRecord[]

    constructor(
        code: ImagePrepareCode,
        details: { facts: ImageFacts; steps: StepRecord[] }
    ) {
        super(`${IMAGE_PREPARE_MESSAGES[code]} (${code})`)
        // Keeps `instanceof` honest if a build ever downlevels classes.
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = "ImagePrepareError"
        this.code = code
        this.facts = details.facts
        this.steps = details.steps
    }
}

export const isImagePrepareError = (err: unknown): err is ImagePrepareError =>
    err instanceof ImagePrepareError

/** Which screen a photo is being prepared for — for Sentry. */
export type ImagePrepareContext = {
    flow: UploadFlow
    /** Narrows a "single" flow down to its screen: "profile", "match"… */
    surface?: string
    signal?: AbortSignal
    /** The server's cap on the compressed file. Every type is 5 MB today. */
    maxBytes?: number
}

/**
 * Build the error AND report it — the one way a photo pipeline gives up, so
 * nothing throws an unreported one.
 */
export function imagePrepareFailed(
    code: ImagePrepareCode,
    details: { facts: ImageFacts; steps: StepRecord[] },
    ctx: Pick<ImagePrepareContext, "flow" | "surface">
): ImagePrepareError {
    const err = new ImagePrepareError(code, details)
    reportImagePrepareFailure(err, ctx)
    return err
}

const HEIC_TYPES = new Set([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
])

/**
 * HEIC/HEIF, by type or — because Windows Chrome reports a `.heic` as `""` —
 * by extension.
 */
export function isHeicFile(file: File): boolean {
    const ext = fileExtension(file.name)
    return HEIC_TYPES.has(file.type.toLowerCase()) || ext === "heic" || ext === "heif"
}

/**
 * Can this browser decode it? Safari decodes HEIC natively; Chrome and
 * Firefox reject it here. With no `createImageBitmap` at all there is no
 * cheap way to ask, so the answer is yes and the compressor finds out.
 */
async function canDecodeImage(blob: Blob): Promise<boolean> {
    if (typeof createImageBitmap !== "function") return true
    try {
        const bitmap = await createImageBitmap(blob)
        bitmap.close()
        return true
    } catch {
        return false
    }
}

/** JPEG quality for a converted HEIC — it is compressed again afterwards. */
const HEIC_JPEG_QUALITY = 0.92

/**
 * HEIC → JPEG with `heic2any` (libheif), imported on this path ONLY: it is a
 * couple of MB, and Safari never needs it, so an iPhone never downloads it.
 */
async function heicToJpeg(file: File): Promise<File> {
    const { default: heic2any } = await import("heic2any")
    const out = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: HEIC_JPEG_QUALITY,
    })
    // A multi-image HEIC (a burst, a Live Photo still) yields its first image.
    const blob = Array.isArray(out) ? out[0] : out
    if (!blob) throw new Error("heic2any returned no image")
    return new File([blob], imageFileName(file.name || "photo", "image/jpeg"), {
        type: "image/jpeg",
        lastModified: file.lastModified,
    })
}

const errorFields = (err: unknown): Pick<StepRecord, "errorName" | "errorMessage"> =>
    err instanceof Error
        ? { errorName: err.name, errorMessage: err.message }
        : {
              // The compressor rejects with a bare `Event` when <img> cannot
              // decode — say what it was rather than "[object Event]".
              errorName: (err as { constructor?: { name?: string } })?.constructor?.name ?? typeof err,
              errorMessage: (err as { type?: string })?.type ?? String(err),
          }

const factsOf = (file: File, maxBytes?: number): ImageFacts => ({
    fileType: file.type,
    extension: fileExtension(file.name),
    size: file.size,
    heic: isHeicFile(file),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
})

/**
 * Runs one step, recording it. Resolves null when it failed — unless the
 * author cancelled, which is rethrown untouched (`isUploadCancellation`
 * recognises every shape it comes in).
 */
async function step<T>(
    steps: StepRecord[],
    name: string,
    signal: AbortSignal | undefined,
    run: () => Promise<T>,
    size?: (value: T) => number
): Promise<T | null> {
    const startedAt = Date.now()
    try {
        const value = await run()
        steps.push({
            name,
            outcome: "ok",
            ...(size ? { outputBytes: size(value) } : {}),
            ms: Date.now() - startedAt,
        })
        return value
    } catch (err) {
        if (signal?.aborted) throw err
        steps.push({ name, outcome: "failed", ...errorFields(err), ms: Date.now() - startedAt })
        return null
    }
}

/**
 * A HEIC this browser cannot decode, converted to JPEG; any other file,
 * untouched. For the flows that show the photo in a cropper BEFORE anything
 * is compressed (profile, cover, org logo and cover, achievements) — a
 * cropper fed a HEIC on Chrome shows nothing and crops nothing. Rejects with
 * a reported {@link ImagePrepareError} when the conversion fails.
 */
export async function ensureDecodableImage(
    file: File,
    ctx: Pick<ImagePrepareContext, "flow" | "surface">
): Promise<File> {
    if (!isHeicFile(file) || (await canDecodeImage(file))) return file

    const steps: StepRecord[] = []
    const jpeg = await step(steps, "heic → jpeg", undefined, () => heicToJpeg(file), (f) => f.size)
    if (jpeg) return jpeg
    throw imagePrepareFailed("IMAGE_DECODE_FAILED", { facts: factsOf(file), steps }, ctx)
}

/**
 * `browser-image-compression` with the two things every flow needs and none
 * used to have:
 *
 *   1. HEIC/HEIF that this browser cannot decode (Chrome and Firefox — a photo
 *      AirDropped or synced to a computer) is converted to JPEG first and then
 *      compressed like anything else. A HEIC the decode check passed but the
 *      compressor still failed on gets the same conversion and one more try.
 *   2. The output is held to the server's cap (`ctx.maxBytes`, 5 MB): the
 *      compressor returns its last attempt even when it could not reach
 *      `maxSizeMB`, and a 400 from the signature request would say nothing
 *      useful.
 *
 * Every failure is an {@link ImagePrepareError} — `IMAGE_DECODE_FAILED` or
 * `IMAGE_TOO_LARGE_AFTER_COMPRESSION` — reported once, here. A cancel
 * rejects exactly as the compressor does (with `signal.reason`).
 *
 * iOS Safari's canvas limit (16,777,216 px) needs nothing here: the
 * compressor already scales its first canvas under it on an iPhone (its
 * `approximateBelowMaximumCanvasSizeOfBrowser`, 4096² for iOS user agents).
 */
export async function compressImage(
    file: File,
    options: Omit<CompressionOptions, "signal">,
    ctx: ImagePrepareContext
): Promise<File> {
    const { signal } = ctx
    const maxBytes = ctx.maxBytes ?? MAX_COMPRESSED_IMAGE_BYTES
    const facts = factsOf(file, maxBytes)
    const steps: StepRecord[] = []

    const compress = (source: File, name: string) =>
        step(steps, name, signal, () => imageCompression(source, { ...options, signal }), (f) => f.size)
    const convert = () => step(steps, "heic → jpeg", signal, () => heicToJpeg(file), (f) => f.size)

    // A HEIC the browser cannot decode only fails inside the compressor, after
    // it has read the whole file; convert it up front instead.
    let source: File | null = file
    let converted = false
    if (facts.heic && !(await canDecodeImage(file))) {
        source = await convert()
        converted = true
    }
    if (signal?.aborted) throw signal.reason

    let out = source ? await compress(source, "compress") : null

    if (!out && facts.heic && !converted) {
        source = await convert()
        out = source ? await compress(source, "compress (converted)") : null
    }

    if (!out) {
        throw imagePrepareFailed("IMAGE_DECODE_FAILED", { facts, steps }, ctx)
    }
    if (out.size > maxBytes) {
        throw imagePrepareFailed(
            "IMAGE_TOO_LARGE_AFTER_COMPRESSION",
            { facts: { ...facts, outputBytes: out.size }, steps },
            ctx
        )
    }
    return out
}
