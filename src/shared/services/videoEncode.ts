/**
 * Browser-side video encoding, before anything is uploaded.
 *
 * ─────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 *
 * R2 does no server-side transcoding: the file that is uploaded is byte-for-byte
 * the file every viewer downloads. Nothing transcodes it on the way in or out,
 * so an unencoded phone recording — a 4K HEVC .mov straight off an iPhone —
 * would upload in full and then fail to play for most of the people it was
 * posted for. So the browser encodes first.
 *
 * ─────────────────────────────────────────────────────────────
 * WHY MEDIABUNNY, AND NOT @remotion/webcodecs
 *
 * Both are WebCodecs-based and both can mux MP4 in-browser, so the deciding
 * factors were licensing first and shape second:
 *
 * - LICENSE. @remotion/webcodecs ships under the Remotion License, which
 *   requires a paid company licence above a small headcount threshold. That is
 *   a commercial commitment, not a technical choice, and it is not one a media
 *   helper should quietly impose on the product. Mediabunny is MPL-2.0:
 *   file-level copyleft, which covers modifications to ITS files and leaves our
 *   source unaffected when it is consumed as a dependency.
 * - DEPENDENCIES. Mediabunny pulls in two `@types/*` packages and nothing else —
 *   no runtime dependencies at all. @remotion/webcodecs pulls
 *   @remotion/media-parser and tracks the Remotion release train.
 * - BUNDLE. Pure ESM and tree-shakeable, and everything here is behind a
 *   dynamic `import()` inside the encode call, so none of it lands in the entry
 *   chunk — a user who never posts a video never downloads the encoder.
 * - MP4 + FASTSTART. `Mp4OutputFormat({ fastStart: 'in-memory' })` puts the moov
 *   atom at the front, which is what lets a clip start playing before it has
 *   fully downloaded. Rotation is handled explicitly (see below).
 * - SUPPORT. WebCodecs `VideoEncoder` is available in Chrome/Edge 94+, Safari
 *   16.4+ and Firefox 130+. Older browsers hit the FAILURE PATH below, which is
 *   why that path is specified as carefully as the happy one.
 *
 * ffmpeg.wasm is deliberately NOT used: a ~30MB wasm payload downloaded before
 * the first byte of a phone upload, running single-threaded on the main origin,
 * is worse on exactly the mid-range Android devices this is meant to serve.
 * ─────────────────────────────────────────────────────────────
 */

// ── Output targets ────────────────────────────────────────────

/**
 * Longest side of the encoded video. 1280 is 720p in both orientations
 * (landscape 1280×720, portrait 720×1280) and is the resolution the feed, the
 * highlight rail and the chat player all render well below. Never upscaled — a
 * 480p clip stays 480p rather than being blown up into a bigger file.
 */
export const MAX_VIDEO_DIMENSION = 1280

/**
 * Target video bitrate. ~2 Mbps at 720p is comfortably above the point where
 * sport footage (fast motion, grass texture) starts to smear, and keeps a
 * 60-second clip around 15MB.
 */
const VIDEO_BITRATE = 2_000_000

/** Audio is preserved, not re-imagined. 128kbps AAC is transparent for speech. */
const AUDIO_BITRATE = 128_000

/**
 * Keyframe interval, in seconds. The default is 5s; 2s roughly doubles the
 * number of seek points for a few percent of file size, and these are short
 * clips people scrub around in.
 */
const KEYFRAME_INTERVAL = 2

/** Poster frames. WebP at this quality lands far under the server's 1MB cap. */
const POSTER_QUALITY = 0.82
const POSTER_MAX_DIMENSION = 1280

/** The highlight rail tile: 9:16. */
const HIGHLIGHT_POSTER_WIDTH = 360
const HIGHLIGHT_POSTER_HEIGHT = 640

/**
 * The one message a user sees when their video cannot be made playable. Exact
 * wording is part of the contract with the three calling flows.
 */
export const VIDEO_UNSUPPORTED_MESSAGE =
    "This video format isn't supported on this device — try a shorter clip or a different file."

/**
 * Container types that can be uploaded as-is when encoding is impossible.
 *
 * Note what is NOT here: `video/quicktime`. A .mov is overwhelmingly HEVC from
 * an iPhone, and uploading one raw is precisely the failure this whole file
 * exists to prevent. It must never reach the bucket by any branch.
 */
const PASSTHROUGH_CONTENT_TYPES = new Set(["video/mp4", "video/webm"])

// ── Types ─────────────────────────────────────────────────────

export type EncodeProgress = (progress: number) => void

export type EncodeVideoOptions = {
    /**
     * Post-encode size ceiling in bytes, matching the server cap for this
     * surface (post 80MB, highlight 40MB, chat 80MB). Also the bar the fast
     * path must clear before an original is passed through untouched.
     */
    maxBytes: number
    /** 0 → 1. Called throughout decode/encode. */
    onProgress?: EncodeProgress
    signal?: AbortSignal
}

export type EncodedVideo = {
    blob: Blob
    width: number
    height: number
    /** Seconds, rounded. */
    duration: number
    /**
     * False when the original was handed back untouched — either the fast path
     * (already compliant) or the failure path (already a safe container).
     */
    wasReencoded: boolean
}

/** Thrown when the user aborts. Callers already treat this as silent. */
export const ENCODE_CANCELLED = "upload_cancelled"

const cancelled = () => new Error(ENCODE_CANCELLED)

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw cancelled()
}

// ── Capability probe ──────────────────────────────────────────

/**
 * Is WebCodecs video encoding usable here at all?
 *
 * Checked before the library is imported, so an unsupported browser never
 * downloads an encoder it cannot run.
 */
export function canEncodeInBrowser(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.VideoEncoder === "function" &&
        typeof window.VideoDecoder === "function"
    )
}

// ── Main entry ────────────────────────────────────────────────

/**
 * Make `file` into something every viewer can play: H.264/MP4, ≤1280 on the
 * longest side, ~2 Mbps, audio preserved, faststart, rotation baked in.
 *
 * Three outcomes, in priority order:
 *
 *   1. FAST PATH — already H.264-in-MP4, already within 1280, already under
 *      `maxBytes`. Returned untouched, `wasReencoded: false`. No decode, no
 *      encode, no progress beyond an immediate 1.
 *   2. ENCODE — the normal path.
 *   3. FAILURE — WebCodecs missing, or the encode threw. An mp4/webm original
 *      under the cap is passed through (`wasReencoded: false`); anything else
 *      (notably a .mov) rejects with {@link VIDEO_UNSUPPORTED_MESSAGE}.
 *
 * Duration is NOT checked here — callers run their own limit first, with their
 * own message, so an overlong clip fails before any of this work starts.
 */
export async function encodeVideo(
    file: File,
    opts: EncodeVideoOptions
): Promise<EncodedVideo> {
    const { maxBytes, onProgress, signal } = opts

    throwIfAborted(signal)

    if (!canEncodeInBrowser()) {
        return passthroughOrFail(file, maxBytes)
    }

    let mediabunny: typeof import("mediabunny")
    try {
        // Dynamic: keeps the encoder out of the entry chunk entirely.
        mediabunny = await import("mediabunny")
    } catch {
        return passthroughOrFail(file, maxBytes)
    }

    throwIfAborted(signal)

    const {
        ALL_FORMATS,
        BlobSource,
        BufferTarget,
        Conversion,
        Input,
        Mp4OutputFormat,
        Output,
        Quality,
        canEncodeVideo,
    } = mediabunny

    let input: InstanceType<typeof Input> | null = null
    // Awaited<ReturnType<...>>, not InstanceType<>: Conversion's constructor is
    // private, so it has no public construct signature to instantiate a type from.
    let conversion: Awaited<ReturnType<typeof Conversion.init>> | null = null
    const onAbort = () => {
        // Fire-and-forget: cancel() makes the in-flight execute() reject, which
        // is what actually unwinds the encode.
        void conversion?.cancel()
    }

    try {
        input = new Input({
            source: new BlobSource(file),
            formats: ALL_FORMATS,
        })

        const track = await input.getPrimaryVideoTrack()
        if (!track) {
            // No video track at all — nothing to encode, and nothing that would
            // render. Treat it as an unsupported file rather than uploading it.
            return passthroughOrFail(file, maxBytes, { requireVideoTrack: true })
        }

        throwIfAborted(signal)

        // `displayWidth/Height` already account for rotation metadata, so a
        // portrait clip recorded as 1920×1080-plus-90° reads as 1080×1920 here.
        const srcWidth = track.displayWidth
        const srcHeight = track.displayHeight
        const duration = await input.computeDuration()

        throwIfAborted(signal)

        // ── 1. Fast path ──
        const isCompliantContainer = file.type === "video/mp4"
        const isH264 = track.codec === "avc"
        const withinBounds =
            Math.max(srcWidth, srcHeight) <= MAX_VIDEO_DIMENSION
        const withinSize = file.size <= maxBytes

        if (isCompliantContainer && isH264 && withinBounds && withinSize) {
            onProgress?.(1)
            return {
                blob: file,
                width: srcWidth,
                height: srcHeight,
                duration: Math.round(duration),
                wasReencoded: false,
            }
        }

        // ── 2. Encode ──
        const { width, height } = fitWithin(
            srcWidth,
            srcHeight,
            MAX_VIDEO_DIMENSION
        )

        // Verify the encoder will actually take these parameters before
        // committing to a conversion — a browser with VideoEncoder but no H.264
        // support (some Linux Chromium builds) should reach the failure path
        // rather than throwing from inside the conversion.
        const h264Usable = await canEncodeVideo("avc", { width, height })
        if (!h264Usable) {
            return passthroughOrFail(file, maxBytes)
        }

        throwIfAborted(signal)

        const output = new Output({
            // 'in-memory' buffers the whole file so the moov atom can be written
            // at the FRONT. That is what faststart means, and it is what lets a
            // viewer start playing before the download finishes. Safe here
            // because output is bounded by maxBytes (≤80MB).
            format: new Mp4OutputFormat({ fastStart: "in-memory" }),
            target: new BufferTarget(),
        })

        conversion = await Conversion.init({
            input,
            output,
            video: {
                width,
                height,
                fit: "contain",
                codec: "avc",
                quality: new Quality({ bitrate: VIDEO_BITRATE }),
                keyFrameInterval: KEYFRAME_INTERVAL,
                // Bake rotation into the frames instead of leaving it in
                // metadata. Rotation metadata is honoured inconsistently —
                // Android Chrome and several in-app browsers ignore it — which
                // is how a portrait clip ends up sideways for half its viewers.
                allowRotationMetadata: false,
            },
            audio: {
                codec: "aac",
                quality: new Quality({ bitrate: AUDIO_BITRATE }),
            },
            // Discarded tracks are handled below; no need for console noise.
            showWarnings: false,
        })

        if (!conversion.isValid) {
            return passthroughOrFail(file, maxBytes)
        }

        if (onProgress) {
            conversion.onProgress = (progress: number) => {
                // Clamped: mediabunny can report 1 before execute() resolves,
                // and a bar that sits at 100% mid-work reads as a hang.
                onProgress(Math.min(0.99, Math.max(0, progress)))
            }
        }

        signal?.addEventListener("abort", onAbort, { once: true })

        await conversion.execute()

        throwIfAborted(signal)

        const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer
        if (!buffer) throw new Error("Encoder produced no output")

        const blob = new Blob([buffer], { type: "video/mp4" })

        // The encode can still overshoot the cap — a long, highly detailed clip
        // at a fixed bitrate. Better a clear message than a server 400.
        if (blob.size > maxBytes) {
            throw new Error(
                `Encoded video is ${mb(blob.size)}MB, over the ${mb(maxBytes)}MB limit`
            )
        }

        onProgress?.(1)

        return {
            blob,
            width,
            height,
            duration: Math.round(duration),
            wasReencoded: true,
        }
    } catch (err) {
        if (signal?.aborted) throw cancelled()
        if (err instanceof Error && err.message === ENCODE_CANCELLED) throw err

        // ── 3. Failure path ──
        return passthroughOrFail(file, maxBytes)
    } finally {
        signal?.removeEventListener("abort", onAbort)
        // Releases the reader and any decoder/encoder the input still holds.
        // Without this an aborted encode leaks a WebCodecs decoder per attempt.
        try {
            await input?.dispose?.()
        } catch {
            /* disposal is best-effort — never mask the real outcome */
        }
    }
}

/**
 * The failure branch, in one place so every `catch` behaves identically.
 *
 * An mp4/webm original under the cap is already something browsers can play, so
 * it goes up untouched rather than blocking the user over a missing encoder.
 * Anything else — a .mov above all — is refused.
 */
function passthroughOrFail(
    file: File,
    maxBytes: number,
    opts?: { requireVideoTrack?: boolean }
): EncodedVideo {
    const safeContainer = PASSTHROUGH_CONTENT_TYPES.has(file.type)

    if (safeContainer && !opts?.requireVideoTrack && file.size <= maxBytes) {
        return {
            blob: file,
            // Unknown without decoding. The attach payload treats these as
            // optional and the player reads the real values from the file.
            width: 0,
            height: 0,
            duration: 0,
            wasReencoded: false,
        }
    }

    throw new Error(VIDEO_UNSUPPORTED_MESSAGE)
}

// ── Poster frames ─────────────────────────────────────────────

export type PosterMode = "feed" | "highlight"

/**
 * Grab a poster frame as WebP.
 *
 * Nothing generates poster frames server-side, and the attach endpoints REQUIRE
 * a thumbnail for every video — so this is not decoration, it is a required part
 * of the upload.
 *
 * Seeks to ~0s and falls back to whatever frame is decodable: frame 0 of a
 * phone recording is often black or not yet decoded, and on mobile Safari a
 * blob-sourced <video> can refuse to seek at all.
 *
 * - `feed`      — intrinsic aspect, longest side ≤1280.
 * - `highlight` — 9:16 cover-crop at 360×640, the shape the rail tile expects.
 */
export function capturePoster(
    source: Blob,
    { mode = "feed" }: { mode?: PosterMode } = {}
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(source)
        const video = document.createElement("video")
        video.preload = "auto"
        video.muted = true
        video.playsInline = true

        let settled = false

        const cleanup = () => {
            window.clearTimeout(timer)
            URL.revokeObjectURL(url)
            video.removeAttribute("src")
            // Forces the element to drop its buffered data now rather than
            // whenever it is collected — this runs on every video upload.
            video.load()
        }

        const finish = (blob: Blob) => {
            if (settled) return
            settled = true
            cleanup()
            resolve(blob)
        }

        const fail = (message: string) => {
            if (settled) return
            settled = true
            cleanup()
            reject(new Error(message))
        }

        // Hard bound. A poster is required, so a stalled probe has to become an
        // error rather than hanging the upload forever.
        const timer = window.setTimeout(
            () => fail("Couldn't read a frame from that video."),
            POSTER_TIMEOUT_MS
        )

        const draw = () => {
            try {
                const vw = video.videoWidth
                const vh = video.videoHeight
                if (!vw || !vh) {
                    fail("Couldn't read a frame from that video.")
                    return
                }

                const canvas = document.createElement("canvas")
                const ctx = canvas.getContext("2d")
                if (!ctx) {
                    fail("Couldn't read a frame from that video.")
                    return
                }

                if (mode === "highlight") {
                    // Cover-crop to 9:16: scale so the box is filled, then
                    // centre what overflows — a cover-crop, not a letterbox.
                    canvas.width = HIGHLIGHT_POSTER_WIDTH
                    canvas.height = HIGHLIGHT_POSTER_HEIGHT

                    const scale = Math.max(
                        canvas.width / vw,
                        canvas.height / vh
                    )
                    const dw = vw * scale
                    const dh = vh * scale

                    ctx.drawImage(
                        video,
                        (canvas.width - dw) / 2,
                        (canvas.height - dh) / 2,
                        dw,
                        dh
                    )
                } else {
                    const { width, height } = fitWithin(
                        vw,
                        vh,
                        POSTER_MAX_DIMENSION
                    )
                    canvas.width = width
                    canvas.height = height
                    ctx.drawImage(video, 0, 0, width, height)
                }

                canvas.toBlob(
                    (blob) => {
                        if (blob) finish(blob)
                        else fail("Couldn't read a frame from that video.")
                    },
                    "image/webp",
                    POSTER_QUALITY
                )
            } catch {
                fail("Couldn't read a frame from that video.")
            }
        }

        video.onloadeddata = () => {
            // Nudge past frame 0 — it is frequently black on phone recordings.
            // If the clip is too short to seek, or the seek is a no-op, `seeked`
            // never fires, so draw what is already decoded instead.
            const target = Math.min(0.1, (video.duration || 0) / 2)
            if (!target) {
                draw()
                return
            }
            try {
                video.currentTime = target
            } catch {
                draw()
            }
        }
        video.onseeked = draw
        video.onerror = () => fail("Couldn't read a frame from that video.")

        video.src = url
        video.load()
    })
}

/** Matches the probe timeouts in chatUpload.service.ts. */
const POSTER_TIMEOUT_MS = 8000

// ── Helpers ───────────────────────────────────────────────────

/**
 * Scale `(w, h)` so the longest side is at most `max`, NEVER upscaling.
 * Both results are even — H.264 chroma subsampling requires it, and an odd
 * dimension makes some encoders fail outright.
 */
export function fitWithin(
    w: number,
    h: number,
    max: number
): { width: number; height: number } {
    if (!w || !h) return { width: max, height: max }

    const longest = Math.max(w, h)
    const scale = longest > max ? max / longest : 1

    return {
        width: even(Math.round(w * scale)),
        height: even(Math.round(h * scale)),
    }
}

const even = (n: number) => (n % 2 === 0 ? n : n - 1)

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))

// ── Progress split, shared by all three video flows ───────────

export type VideoUploadPhase = "encoding" | "uploading"

/**
 * Encoding owns the first 70% of the bar, the upload the last 30%.
 *
 * Not arbitrary: on a mid-range phone a 30s 1080p clip spends noticeably longer
 * being encoded than being sent, and a bar that sits at 0% through the slow half
 * reads as a hang. The same split is used by posts, highlights and chat so the
 * three surfaces behave identically.
 */
export const ENCODE_PROGRESS_SHARE = 0.7

/**
 * Build the two callbacks a video flow needs from one reporter.
 *
 * `report` receives a 0→1 fraction of the WHOLE operation plus the phase, so a
 * caller can label the encode half "Optimizing video…" without tracking the
 * split itself.
 */
export function videoProgressSplit(
    report?: (fraction: number, phase: VideoUploadPhase) => void
) {
    return {
        onEncode: (progress: number) =>
            report?.(
                Math.max(0, Math.min(1, progress)) * ENCODE_PROGRESS_SHARE,
                "encoding"
            ),
        onUpload: (loaded: number, total: number) =>
            report?.(
                ENCODE_PROGRESS_SHARE +
                    (total > 0 ? loaded / total : 0) *
                        (1 - ENCODE_PROGRESS_SHARE),
                "uploading"
            ),
    }
}

/** The label shown while the encode half of the bar is running. */
export const OPTIMIZING_LABEL = "Optimizing video…"
