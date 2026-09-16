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

import {
    THUMB_MAX_BYTES,
    canEncodeWebP,
    type LossyImageType,
} from "@/shared/services/imageVariants"

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

/**
 * Audio bitrate for the ONE case audio is re-encoded (a source codec that
 * cannot ship in MP4 — see {@link COPYABLE_AUDIO_CODECS}). 128kbps AAC is
 * transparent for speech. Everything else keeps its original packets.
 */
const AUDIO_BITRATE = 128_000

/**
 * Keyframe interval, in seconds. The default is 5s; 2s roughly doubles the
 * number of seek points for a few percent of file size, and these are short
 * clips people scrub around in.
 */
const KEYFRAME_INTERVAL = 2

/**
 * Poster frames.
 *
 * The server signs a "thumb" only up to `THUMB_MAX_BYTES` (1MB). WebP or JPEG
 * at the first quality step lands far under that, but the budget is enforced
 * here regardless — with headroom, so the request never lands ON the cap —
 * by stepping the quality down and then the longest side, until it fits.
 * Anything that still does not fit is refused with a clear message rather
 * than becoming a 400 from the signature request.
 */
export const POSTER_MAX_BYTES = Math.floor(THUMB_MAX_BYTES * 0.88) // ~900KB
const POSTER_QUALITY_STEPS = [0.82, 0.7, 0.58] as const
const POSTER_DIMENSION_STEPS = [1280, 960, 720] as const

/** What the user sees when a poster cannot be made to fit. */
export const VIDEO_PREPARE_FAILED_MESSAGE =
    "Couldn't prepare this video. Please try again."

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

// ── Audio ─────────────────────────────────────────────────────

/**
 * Audio codecs whose packets are COPIED into the MP4 rather than re-encoded.
 *
 * Copying is what keeps the sound on a phone. Re-encoding needs WebCodecs to
 * decode the source AND encode AAC, and a browser that can do neither (iOS
 * Safari, for most of its life) makes mediabunny drop the audio track — while
 * `isValid` stays true because the video track survived. An iPhone .mov is
 * AAC already, so its packets go across untouched and never meet a codec.
 *
 * MP4 can technically hold Opus, FLAC, AC-3 and more, but the object that is
 * uploaded is the object every viewer plays, and only AAC and MP3 play in
 * every browser the app targets. Anything else is re-encoded to AAC.
 */
const COPYABLE_AUDIO_CODECS: ReadonlySet<string> = new Set(["aac", "mp3"])

/** `code` of {@link VideoAudioLostError}, for callers that match on it. */
export const VIDEO_AUDIO_LOST = "VIDEO_AUDIO_LOST"

/**
 * What highlights and chat show when the sound could not be kept. The post
 * composer has its own dialog with the same guidance.
 */
export const VIDEO_AUDIO_LOST_MESSAGE =
    "This browser can't keep the sound on this video. Try again from a computer, or update your phone's software."

/**
 * Thrown when the source has sound, this browser cannot carry it into the
 * output, and the original cannot be uploaded as-is. A video never loses its
 * sound silently: the caller asks the user and retries with
 * `allowSilentAudio: true` if they agree.
 */
export class VideoAudioLostError extends Error {
    readonly code = VIDEO_AUDIO_LOST

    constructor() {
        super(VIDEO_AUDIO_LOST_MESSAGE)
        this.name = "VideoAudioLostError"
    }
}

export const isVideoAudioLostError = (err: unknown): err is VideoAudioLostError =>
    err instanceof VideoAudioLostError ||
    (err instanceof Error && (err as { code?: unknown }).code === VIDEO_AUDIO_LOST)

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
    /**
     * Go ahead without the audio track when this browser cannot keep it.
     * Off by default — the caller must ask the user first, then retry with
     * this set. See {@link VideoAudioLostError}.
     */
    allowSilentAudio?: boolean
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
    /**
     * True when the source had sound and the output has none. Only ever true
     * with `allowSilentAudio` — the user agreed to it.
     */
    audioDropped: boolean
}

/** Thrown when the user aborts. Callers already treat this as silent. */
export const ENCODE_CANCELLED = "upload_cancelled"

const cancelled = () => new Error(ENCODE_CANCELLED)

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw cancelled()
}

/**
 * Which branch an encode took. Logged in development only — the path a phone
 * takes is invisible in the result, and "the sound is gone" is exactly the
 * kind of bug that needs the branch, not the stack trace.
 */
type EncodePath =
    | "fast path"
    | "audio copied"
    | "audio re-encoded"
    | "AAC WASM fallback"
    | "original passed through"
    | "silent by choice"
    | "no audio track"

function logPath(path: EncodePath, detail?: string) {
    if (process.env.NODE_ENV !== "development") return
    console.info(`[videoEncode] ${path}${detail ? ` — ${detail}` : ""}`)
}

/**
 * What the poster came out as. The type is the interesting part: a browser
 * with no WebP encoder hands back PNG when asked for WebP, and "the thumb was
 * 1.4MB" is invisible in the result the caller gets.
 */
function logPoster(blob: Blob, width: number, height: number, quality: number) {
    if (process.env.NODE_ENV !== "development") return
    console.info(
        `[videoEncode] poster — ${blob.type} ${kb(blob.size)}KB ${width}×${height} q${quality}`
    )
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

// ── AAC encoder extension ─────────────────────────────────────

/**
 * `@mediabunny/aac-encoder` is a ~1MB WASM build of libavcodec's AAC encoder.
 * It is loaded ONLY when a browser has decoded the audio and then has no AAC
 * encoder to hand it to (Firefox, older Safari), and only once per page — the
 * package warns loudly, and rightly, if it is registered twice.
 */
let aacEncoderReady: Promise<void> | null = null

function loadAacEncoder(): Promise<void> {
    aacEncoderReady ??= import("@mediabunny/aac-encoder").then(
        ({ registerAacEncoder }) => {
            registerAacEncoder()
        },
        (err) => {
            // Let the next attempt try the download again.
            aacEncoderReady = null
            throw err
        }
    )
    return aacEncoderReady
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
 *   2. ENCODE — the normal path. Audio packets are copied when they can be
 *      (see {@link COPYABLE_AUDIO_CODECS}); when the browser drops the audio
 *      track anyway, the AAC WASM encoder is tried, then the original is
 *      passed through if it is a safe container, and otherwise the encode
 *      REFUSES with {@link VideoAudioLostError} unless `allowSilentAudio`.
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
    const { maxBytes, onProgress, signal, allowSilentAudio = false } = opts

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
        BufferSource,
        BufferTarget,
        Conversion,
        EncodedAudioPacketSource,
        Input,
        MP4,
        Mp4OutputFormat,
        Output,
        Quality,
        canEncodeVideo,
    } = mediabunny

    type MbInput = InstanceType<typeof Input>
    // Awaited<ReturnType<...>>, not InstanceType<>: Conversion's constructor is
    // private, so it has no public construct signature to instantiate a type from.
    type MbConversion = Awaited<ReturnType<typeof Conversion.init>>

    let input: MbInput | null = null
    let conversion: MbConversion | null = null
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

        // Known BEFORE the conversion is built, so a conversion that quietly
        // drops the sound can be told apart from a clip that never had any.
        const hasAudio = (await input.getPrimaryAudioTrack()) !== null

        // `displayWidth/Height` already account for rotation metadata, so a
        // portrait clip recorded as 1920×1080-plus-90° reads as 1080×1920 here.
        const srcWidth = track.displayWidth
        const srcHeight = track.displayHeight
        const duration = await input.computeDuration()

        throwIfAborted(signal)

        // ── 1. Fast path ──
        const isCompliantContainer = file.type === "video/mp4"
        const isH264 = (await track.getCodec()) === "avc"
        const withinBounds =
            Math.max(srcWidth, srcHeight) <= MAX_VIDEO_DIMENSION
        const withinSize = file.size <= maxBytes

        if (isCompliantContainer && isH264 && withinBounds && withinSize) {
            logPath("fast path")
            onProgress?.(1)
            return {
                blob: file,
                width: srcWidth,
                height: srcHeight,
                duration: Math.round(duration),
                wasReencoded: false,
                audioDropped: false,
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

        // Mediabunny copies audio packets only when no track starts BEFORE the
        // conversion does, and its default start is max(earliest packet, 0).
        // AAC priming — the edit list every iPhone recording carries — puts the
        // first audio packet a few ms before 0, so the audio "needs trimming"
        // and is decoded and re-encoded instead of copied; on a browser without
        // an AAC codec that is where the sound goes. Starting the conversion at
        // that negative timestamp keeps the copy path open. Every track is then
        // shifted later by those few ms, which nobody can hear.
        const earliest = await input.getFirstTimestamp()
        const trim = earliest < 0 ? { start: earliest } : undefined

        const source = input

        /**
         * Build a fresh conversion. A non-composable conversion owns its output,
         * so a rebuild (after registering the AAC encoder) needs a new one.
         *
         * `copy` asks for the source codec — with no `quality`, `bitrate`,
         * `sampleRate` or `numberOfChannels`, which are the options that force
         * a re-encode — for anything MP4 can carry, and AAC for the rest.
         * `aac` re-targets everything at AAC, for the rebuild.
         */
        const build = async (audioMode: "copy" | "aac") => {
            const output = new Output({
                // 'in-memory' buffers the whole file so the moov atom can be
                // written at the FRONT. That is what faststart means, and it is
                // what lets a viewer start playing before the download
                // finishes. Safe here because output is bounded by maxBytes
                // (≤80MB).
                format: new Mp4OutputFormat({ fastStart: "in-memory" }),
                target: new BufferTarget(),
            })

            const built = await Conversion.init({
                input: source,
                output,
                trim,
                video: {
                    width,
                    height,
                    fit: "contain",
                    codec: "avc",
                    quality: new Quality({ bitrate: VIDEO_BITRATE }),
                    keyFrameInterval: KEYFRAME_INTERVAL,
                    // Bake rotation into the frames instead of leaving it in
                    // metadata. Rotation metadata is honoured inconsistently —
                    // Android Chrome and several in-app browsers ignore it —
                    // which is how a portrait clip ends up sideways for half
                    // its viewers.
                    allowRotationMetadata: false,
                },
                audio: async (audioTrack) => {
                    const codec = await audioTrack.getCodec()
                    if (audioMode === "copy" && codec && COPYABLE_AUDIO_CODECS.has(codec)) {
                        return { codec }
                    }
                    return {
                        codec: "aac",
                        quality: new Quality({ bitrate: AUDIO_BITRATE }),
                    }
                },
                // Discarded tracks are handled below; no need for console noise.
                showWarnings: false,
            })

            return { output, conversion: built }
        }

        let { output, conversion: built } = await build("copy")
        conversion = built

        let audioDropped = false
        let path: EncodePath = "no audio track"

        if (hasAudio) {
            const audioKept = () => output.tracks.some((t) => t.type === "audio")
            const discardedFor = (reason: string) =>
                built.discardedTracks.some(
                    (d) => d.track.type === "audio" && d.reason === reason
                )

            // The browser decoded the audio but has nothing to encode it with
            // (Firefox has no AAC encoder; older Safari has none at all). The
            // WASM encoder fills exactly that gap, so load it — this path only —
            // and build the conversion again with everything aimed at AAC.
            if (!audioKept() && discardedFor("no_encodable_target_codec")) {
                try {
                    await loadAacEncoder()
                    throwIfAborted(signal)
                    ;({ output, conversion: built } = await build("aac"))
                    conversion = built
                    if (audioKept()) path = "AAC WASM fallback"
                } catch (err) {
                    if (signal?.aborted) throw cancelled()
                    if (err instanceof Error && err.message === ENCODE_CANCELLED) throw err
                    // The download failed or the encoder refused the track —
                    // the conversion built first is still the one to fall back
                    // from, and the checks below decide what happens to it.
                }
            }

            if (!audioKept()) {
                const original = passthroughIfSafe(file, maxBytes, duration)
                if (original) {
                    logPath("original passed through", "audio track could not be kept")
                    onProgress?.(1)
                    return original
                }
                if (!allowSilentAudio) throw new VideoAudioLostError()
                audioDropped = true
                path = "silent by choice"
            } else if (path !== "AAC WASM fallback") {
                const audioTrack = output.tracks.find((t) => t.type === "audio")
                path =
                    audioTrack?.source instanceof EncodedAudioPacketSource
                        ? "audio copied"
                        : "audio re-encoded"
            }
        }

        if (!conversion.isValid) {
            return passthroughOrFail(file, maxBytes)
        }

        // An abort during init (or the AAC download) has no listener yet to
        // cancel anything; catch it here rather than after a full encode.
        throwIfAborted(signal)

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

        // Belt and braces: the conversion said it kept the audio, so make sure
        // the bytes agree before they are uploaded for good.
        if (hasAudio && !audioDropped) {
            const check = new Input({
                source: new BufferSource(buffer),
                formats: [MP4],
            })
            let outputHasAudio: boolean
            try {
                outputHasAudio = (await check.getPrimaryAudioTrack()) !== null
            } finally {
                check.dispose()
            }

            if (!outputHasAudio) {
                const original = passthroughIfSafe(file, maxBytes, duration)
                if (original) {
                    logPath("original passed through", "encoded output had no audio")
                    onProgress?.(1)
                    return original
                }
                if (!allowSilentAudio) throw new VideoAudioLostError()
                audioDropped = true
                path = "silent by choice"
            }
        }

        const blob = new Blob([buffer], { type: "video/mp4" })

        // The encode can still overshoot the cap — a long, highly detailed clip
        // at a fixed bitrate. Better a clear message than a server 400.
        if (blob.size > maxBytes) {
            throw new Error(
                `Encoded video is ${mb(blob.size)}MB, over the ${mb(maxBytes)}MB limit`
            )
        }

        logPath(path)
        onProgress?.(1)

        return {
            blob,
            width,
            height,
            duration: Math.round(duration),
            wasReencoded: true,
            audioDropped,
        }
    } catch (err) {
        if (signal?.aborted) throw cancelled()
        if (err instanceof Error && err.message === ENCODE_CANCELLED) throw err
        // Not a failure of the encoder: it is a decision for the user, and the
        // failure path below would upload the file with its sound gone.
        if (isVideoAudioLostError(err)) throw err

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
            audioDropped: false,
        }
    }

    throw new Error(VIDEO_UNSUPPORTED_MESSAGE)
}

/**
 * The original, untouched, when its sound cannot be carried through an encode
 * but the file itself is a container browsers play — or null when it is not
 * (a .mov) or is over the cap. Sound intact beats a smaller, silent file; the
 * dimensions stay unknown, as on every passthrough, but the duration was
 * measured already so it is kept.
 */
function passthroughIfSafe(
    file: File,
    maxBytes: number,
    duration: number
): EncodedVideo | null {
    if (!PASSTHROUGH_CONTENT_TYPES.has(file.type) || file.size > maxBytes) {
        return null
    }
    return {
        blob: file,
        width: 0,
        height: 0,
        duration: Math.round(duration),
        wasReencoded: false,
        audioDropped: false,
    }
}

// ── Poster frames ─────────────────────────────────────────────

export type PosterMode = "feed" | "highlight"

/**
 * Grab a poster frame as WebP — or JPEG on a browser that cannot write WebP.
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
 *
 * The returned blob's `type` is the format that was REALLY written, and its
 * size is under {@link POSTER_MAX_BYTES} — see {@link encodePoster}.
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
        // The encode below is async and `seeked` can fire more than once; one
        // frame is plenty.
        let drawing = false

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
            () => fail(POSTER_READ_FAILED_MESSAGE),
            POSTER_TIMEOUT_MS
        )

        const draw = () => {
            if (settled || drawing) return
            drawing = true
            encodePoster(video, mode).then(finish, (err: unknown) =>
                fail(
                    err instanceof Error && err.message
                        ? err.message
                        : POSTER_READ_FAILED_MESSAGE
                )
            )
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
        video.onerror = () => fail(POSTER_READ_FAILED_MESSAGE)

        video.src = url
        video.load()
    })
}

const POSTER_READ_FAILED_MESSAGE = "Couldn't read a frame from that video."

/**
 * Paint the current frame at the size `mode` wants, bounded by `maxDimension`
 * on the longest side for `feed` (ignored for the fixed-size highlight tile).
 */
function drawPosterFrame(
    video: HTMLVideoElement,
    mode: PosterMode,
    maxDimension: number
): HTMLCanvasElement {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) throw new Error(POSTER_READ_FAILED_MESSAGE)

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error(POSTER_READ_FAILED_MESSAGE)

    if (mode === "highlight") {
        // Cover-crop to 9:16: scale so the box is filled, then centre what
        // overflows — a cover-crop, not a letterbox.
        canvas.width = HIGHLIGHT_POSTER_WIDTH
        canvas.height = HIGHLIGHT_POSTER_HEIGHT

        const scale = Math.max(canvas.width / vw, canvas.height / vh)
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
        const { width, height } = fitWithin(vw, vh, maxDimension)
        canvas.width = width
        canvas.height = height
        ctx.drawImage(video, 0, 0, width, height)
    }

    return canvas
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => {
        try {
            canvas.toBlob(resolve, type, quality)
        } catch {
            resolve(null)
        }
    })

/**
 * Encode the frame under the byte budget.
 *
 * `canvas.toBlob(cb, "image/webp")` is a request the browser may ignore: with
 * no WebP encoder (every iPhone browser) it returns a lossless PNG — quality
 * argument and all — and a detailed 720×1280 frame as PNG is routinely over
 * the server's 1MB thumb cap. So WebP is asked for only where the probe says
 * it will be honoured, JPEG otherwise, the returned blob's REAL type and size
 * are checked, and the quality steps down first, then the longest side, until
 * the poster fits under {@link POSTER_MAX_BYTES}.
 */
async function encodePoster(
    video: HTMLVideoElement,
    mode: PosterMode
): Promise<Blob> {
    let type: LossyImageType = (await canEncodeWebP())
        ? "image/webp"
        : "image/jpeg"

    // The highlight tile is a fixed 360×640, so only quality can give.
    const dimensions: readonly number[] =
        mode === "highlight" ? [HIGHLIGHT_POSTER_HEIGHT] : POSTER_DIMENSION_STEPS

    for (const maxDimension of dimensions) {
        const canvas = drawPosterFrame(video, mode, maxDimension)

        for (const quality of POSTER_QUALITY_STEPS) {
            let blob = await toBlob(canvas, type, quality)
            if (!blob) throw new Error(POSTER_READ_FAILED_MESSAGE)

            // The probe said WebP but the browser wrote something else: fall
            // back to JPEG for the rest of the run rather than trusting it.
            if (blob.type !== type && type === "image/webp") {
                type = "image/jpeg"
                blob = await toBlob(canvas, type, quality)
                if (!blob) throw new Error(POSTER_READ_FAILED_MESSAGE)
            }
            if (blob.type !== type) throw new Error(VIDEO_PREPARE_FAILED_MESSAGE)

            if (blob.size <= POSTER_MAX_BYTES) {
                logPoster(blob, canvas.width, canvas.height, quality)
                return blob
            }
        }
    }

    throw new Error(VIDEO_PREPARE_FAILED_MESSAGE)
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
const kb = (bytes: number) => Math.round(bytes / 1024)

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
export const OPTIMIZING_LABEL = "Uploading video…"
