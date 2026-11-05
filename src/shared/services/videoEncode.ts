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
 * WHY A LADDER, AND NOT ONE ENCODE
 *
 * Real people post whatever their phone gives them, and the app must not
 * block a normal video. One conversion strategy did: a full decode → encode
 * that fails on iOS for reasons that have nothing to do with the file (the
 * decoder runs out of memory on 4K, the encoder refuses a size), and every
 * failure fell back to "upload the original if it is mp4/webm", which an
 * iPhone .mov never is. So `encodeVideo` probes the source once, plans an
 * ordered list of ways to make it playable (`planVideoPrep`, pure, tested on
 * its own), and runs them until one works — copying H.264 packets into MP4
 * where that is enough, encoding where it is not, and smaller or copied
 * fallbacks after that. When nothing works it says why, with a code, and
 * Sentry hears about it with every step that was tried.
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
 *   16.4+ and Firefox 130+. A packet copy (the remux steps) needs no WebCodecs
 *   at all, which is what still gets an H.264 .mov through on an older browser.
 *
 * ffmpeg.wasm is deliberately NOT used: a ~30MB wasm payload downloaded before
 * the first byte of a phone upload, running single-threaded on the main origin,
 * is worse on exactly the mid-range Android devices this is meant to serve.
 * ─────────────────────────────────────────────────────────────
 */

import type {
    ConversionVideoOptions,
    InputVideoTrack,
} from "mediabunny"

import { fileExtension } from "@/shared/constants/media"
import {
    frameCandidateTimes,
    grabVideoFrame,
    isBlackLuma,
    measureFrameLuma,
} from "@/shared/services/videoFrame"
import {
    THUMB_MAX_BYTES,
    canEncodeWebP,
    type LossyImageType,
} from "@/shared/services/imageVariants"
import {
    reportVideoFallbackUsed,
    reportVideoPrepareFailure,
    type UploadFlow,
} from "@/shared/services/uploadTelemetry"

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

// ── The ladder's own targets ──────────────────────────────────

/**
 * Ceiling on the quick remux. A packet copy keeps the source's bitrate, and
 * every viewer downloads exactly that file: past ~5 Mbps a ≤720p clip is a
 * much heavier download than its 2 Mbps encode for nothing anyone can see,
 * so it is encoded instead. (The fallback remuxes have no such ceiling — by
 * then a heavy file beats no file.)
 */
const QUICK_REMUX_MAX_BITRATE = 5_000_000

/**
 * The fit-to-cap encode, run only when the normal encode came out over the
 * cap: aim at 92% of it, never below 600 kbps (below that, sport smears).
 */
const BITRATE_FIT_HEADROOM = 0.92
const MIN_FIT_BITRATE = 600_000

/**
 * The smaller encodes, after the normal one failed. Smaller frames need less
 * decoder and encoder memory, which is what iOS runs out of on a 4K clip.
 */
const SMALLER_ENCODE_DIMENSIONS = [960, 720] as const
const SMALLER_ENCODE_BITRATE = 1_500_000

/**
 * HEVC copied into MP4 (`hvc1`), tried as the LAST thing before giving up.
 *
 * It plays on every Apple device and on most Android and Windows browsers
 * with hardware HEVC — but not everywhere (Firefox, older Android, Linux), so
 * for some viewers the post is a black box. That beats refusing the post
 * outright, which is the only other outcome by the time this runs. Every use
 * is reported (`hevc_last_resort`) so how often it happens is known; turn it
 * off here if that number says it is the wrong trade.
 */
export const ALLOW_HEVC_LAST_RESORT = true

/**
 * Poster frames.
 *
 * The server signs a "thumb" only up to `THUMB_MAX_BYTES` (1MB). WebP or JPEG
 * at the first quality step lands far under that, but the budget is enforced
 * here regardless — with headroom, so the request never lands ON the cap —
 * by stepping the quality down and then the longest side, until it fits.
 */
export const POSTER_MAX_BYTES = Math.floor(THUMB_MAX_BYTES * 0.88) // ~900KB
const POSTER_QUALITY_STEPS = [0.82, 0.7, 0.58] as const
const POSTER_DIMENSION_STEPS = [1280, 960, 720] as const

/** The placeholder poster's fill — the app's dark surface — and its size when the video's is unknown. */
const POSTER_PLACEHOLDER_COLOR = "#0B0F0C"
const POSTER_PLACEHOLDER_WIDTH = 720
const POSTER_PLACEHOLDER_HEIGHT = 1280

/**
 * What the post composer says when the signature request refuses what the
 * client prepared — a client bug, not something the author can fix.
 */
export const VIDEO_PREPARE_FAILED_MESSAGE =
    "Couldn't prepare this video. Please try again."

/** The highlight rail tile: 9:16. */
const HIGHLIGHT_POSTER_WIDTH = 360
const HIGHLIGHT_POSTER_HEIGHT = 640

/**
 * The old one-size-fits-all refusal. Kept exported for compatibility; nothing
 * throws it any more — every failure is a {@link VideoPrepareError} whose
 * message says which of a few things went wrong, with a code.
 */
export const VIDEO_UNSUPPORTED_MESSAGE =
    "This video format isn't supported on this device — try a shorter clip or a different file."

/**
 * Container types that can be uploaded as-is when nothing else worked.
 *
 * Note what is NOT here: `video/quicktime`. A .mov is overwhelmingly HEVC from
 * an iPhone, and uploading one raw is precisely the failure this whole file
 * exists to prevent. It must never reach the bucket by any branch — a .mov is
 * remuxed or encoded into MP4, or refused.
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
 * `allowSilentAudio: true` if they agree. It stops the ladder at once and is
 * never wrapped in a {@link VideoPrepareError}.
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

// ── Why it could not be done ──────────────────────────────────

export type VideoPrepareCode =
    /** No WebCodecs here, and nothing that needs none of it worked. */
    | "NO_WEBCODECS"
    /** The file could not be parsed as a media file at all. */
    | "PROBE_FAILED"
    /** It parsed, and has no video track. */
    | "NO_VIDEO_TRACK"
    /** This browser cannot decode the source's video codec. */
    | "DECODE_UNSUPPORTED"
    /** This browser has no H.264 encoder for that size. */
    | "ENCODE_UNSUPPORTED"
    /** The conversion was configured but could not run (or could not copy). */
    | "CONVERSION_INVALID"
    /** The conversion ran and threw, or produced nothing. */
    | "CONVERSION_FAILED"
    /** Everything that produced a file produced one over the cap. */
    | "TOO_LARGE"
    /** Not even a placeholder poster could be written. */
    | "POSTER_FAILED"
    /**
     * `serverFallback` only: the trimmed plan produced nothing, and the server
     * will convert the original instead. A decision, not a failure — never
     * reported, never shown.
     */
    | "SERVER_PREFERRED"

function videoPrepareSentence(code: VideoPrepareCode): string {
    switch (code) {
        case "SERVER_PREFERRED":
            return "This video will be converted on the server"
        case "TOO_LARGE":
            return "This video is too large to post, even after compressing it. Try a shorter clip"
        case "PROBE_FAILED":
        case "NO_VIDEO_TRACK":
            return "This file couldn't be read as a video. Try a different file"
        default:
            return "This video couldn't be converted on this device. Try a shorter clip, or post it from a computer"
    }
}

/**
 * What was known about the source, probed once before anything else runs.
 * Best-effort: every field is optional and a probe that fails never throws —
 * it leaves `hasVideo` unset and says why in `probeError`. Never the file's
 * name, never a URL.
 */
export type SourceFacts = {
    fileType?: string
    extension?: string
    size?: number
    /** Seconds. */
    duration?: number
    /** mediabunny's format name: "MP4", "QuickTime File Format", "WebM"… */
    container?: string
    /** "avc", "hevc", "vp9", "av1"… */
    videoCodec?: string
    /** The full codec string, e.g. "avc1.640028" or "hvc1.2.4.L153.B0". */
    codecString?: string
    codedWidth?: number
    codedHeight?: number
    /** After rotation and pixel aspect — what a viewer sees. */
    displayWidth?: number
    displayHeight?: number
    /** Clockwise degrees from the container's metadata. */
    rotation?: number
    /** Video bits per second. */
    bitrate?: number
    /** "packets" is measured from the track; "file size" is size × 8 / duration. */
    bitrateSource?: "packets" | "file size"
    /** Average frames per second, from packet stats. */
    frameRate?: number
    hdr?: boolean
    colorSpace?: {
        primaries?: string | null
        transfer?: string | null
        matrix?: string | null
        fullRange?: boolean | null
    }
    /** true / false once probed; unset when the probe failed. */
    hasVideo?: boolean
    hasAudio?: boolean
    audioCodec?: string
    sampleRate?: number
    channels?: number
    /** Earliest packet across tracks; AAC priming makes it slightly negative. */
    firstTimestamp?: number
    canEncodeInBrowser?: boolean
    userAgent?: string
    /** "Name: message" of what stopped the probe. */
    probeError?: string
}

export type VideoStepName =
    | "fast path"
    | "quick remux"
    | "encoded"
    | "encoded (bitrate fit)"
    | "H.264 remux"
    | "encoded (smaller)"
    | "HEVC remux"
    | "original passed through"

export type PosterStepName =
    | "poster (video element)"
    | "poster (frame sink)"
    | "poster (placeholder)"

/**
 * One step of a pipeline, as kept on the error and sent to Sentry. Shared
 * with the photo pipeline (imageVariants.ts), whose step names are its own.
 */
export type StepRecord = {
    name: VideoStepName | PosterStepName | (string & {})
    outcome: "ok" | "skipped" | "failed"
    /** Why it was skipped, why it failed, or a note on how it succeeded. */
    reason?: string
    /** A failed video step's classification. */
    code?: VideoPrepareCode
    errorName?: string
    errorMessage?: string
    /** Size of what it produced — on success, or over the cap. */
    outputBytes?: number
    ms: number
}

/**
 * The one way preparing a video fails. The message is a sentence for the
 * author plus a code they can quote — "This video is too large to post, even
 * after compressing it. Try a shorter clip (VIDEO_TOO_LARGE)" — and `facts`
 * and `steps` are the diagnosis, for Sentry. Reported once, by the code that
 * throws it.
 */
export class VideoPrepareError extends Error {
    readonly code: VideoPrepareCode
    readonly facts: SourceFacts
    readonly steps: StepRecord[]

    constructor(
        code: VideoPrepareCode,
        details: { facts: SourceFacts; steps: StepRecord[] }
    ) {
        super(`${videoPrepareSentence(code)} (VIDEO_${code})`)
        // Keeps `instanceof` honest if a build ever downlevels classes.
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = "VideoPrepareError"
        this.code = code
        this.facts = details.facts
        this.steps = details.steps
    }
}

export const isVideoPrepareError = (err: unknown): err is VideoPrepareError =>
    err instanceof VideoPrepareError

/**
 * A step failing in a known way, inside the ladder only — the runner records
 * it and moves on. `inner` is what actually threw, when something did.
 */
class StepFailure extends Error {
    constructor(
        readonly code: VideoPrepareCode,
        reason: string,
        readonly inner?: unknown
    ) {
        super(reason)
        this.name = "StepFailure"
    }
}

// ── Types ─────────────────────────────────────────────────────

export type EncodeProgress = (progress: number) => void

export type EncodeVideoOptions = {
    /**
     * Post-encode size ceiling in bytes, matching the server cap for this
     * surface (post 80MB, highlight 40MB, chat 80MB). Every output is checked
     * against it, the fast path's original included.
     */
    maxBytes: number
    /**
     * 0 → 1. Called throughout. Each step that converts starts again from 0,
     * so a fallback is visible as the bar restarting rather than a hang.
     */
    onProgress?: EncodeProgress
    signal?: AbortSignal
    /**
     * Go ahead without the audio track when this browser cannot keep it.
     * Off by default — the caller must ask the user first, then retry with
     * this set. See {@link VideoAudioLostError}.
     */
    allowSilentAudio?: boolean
    /** Which composer this is, for Sentry. */
    flow?: UploadFlow
    /**
     * The server can convert the original (mediaCapabilities.ts), so try only
     * what is quick and certain here — the fast path, the quick remux, and
     * the normal encode for a clip of {@link SERVER_FALLBACK_MAX_ENCODE_SECONDS}
     * or less — and hand everything else to the server. With nothing left,
     * rejects with an unreported `SERVER_PREFERRED`. See videoPrep.ts.
     */
    serverFallback?: boolean
}

export type EncodedVideo = {
    blob: Blob
    /** Display size: the encode's target, or the source's for a copy. 0 = unknown. */
    width: number
    height: number
    /** Seconds, rounded. */
    duration: number
    /**
     * True when the frames were decoded and encoded again. False for the
     * original handed back untouched, and for a remux (same frames, MP4 box).
     */
    wasReencoded: boolean
    /**
     * True when the source had sound and the output has none. Only ever true
     * with `allowSilentAudio` — the user agreed to it.
     */
    audioDropped: boolean
    /** Which step produced it. */
    path: VideoStepName
    /** The output's video codec. */
    codec: "avc" | "hevc" | "other"
}

/** Thrown when the user aborts. Callers already treat this as silent. */
export const ENCODE_CANCELLED = "upload_cancelled"

const cancelled = () => new Error(ENCODE_CANCELLED)

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw cancelled()
}

const isCancelledError = (err: unknown) =>
    err instanceof Error && err.message === ENCODE_CANCELLED

/**
 * Which step produced the video, and how its audio went across. Logged in
 * development only — the path a phone takes is invisible in the result, and
 * "the sound is gone" is exactly the kind of bug that needs the branch, not
 * the stack trace.
 */
type AudioPath =
    | "audio copied"
    | "audio re-encoded"
    | "AAC WASM fallback"
    | "silent by choice"
    | "no audio track"

function logPath(path: string, detail?: string) {
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
 * Is WebCodecs video encoding usable here at all? Decides whether the encode
 * steps are planned; the remux steps need none of it.
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

// ── Probing the source ────────────────────────────────────────

type Mediabunny = typeof import("mediabunny")

/**
 * Dynamic: keeps the demuxer, muxer and encoder out of the entry chunk. One
 * retry, because on a phone the usual reason a chunk fails to load is the
 * network blinking, and a second request is cheap next to refusing the post.
 */
async function loadMediabunny(): Promise<{ mb: Mediabunny | null; error?: unknown }> {
    try {
        return { mb: await import("mediabunny") }
    } catch {
        try {
            return { mb: await import("mediabunny") }
        } catch (error) {
            return { mb: null, error }
        }
    }
}

const describeError = (err: unknown): string =>
    err instanceof Error ? `${err.name}: ${err.message}` : String(err)

/** A probe field: its value, or undefined when reading it threw. */
async function optional<T>(read: () => T | Promise<T>): Promise<T | undefined> {
    try {
        return await read()
    } catch {
        return undefined
    }
}

/** Display size, from the async accessors with the deprecated getters behind them. */
async function displaySizeOf(
    track: InputVideoTrack
): Promise<{ width: number; height: number }> {
    const width =
        (await optional(() => track.getDisplayWidth())) ??
        (await optional(() => track.displayWidth)) ??
        0
    const height =
        (await optional(() => track.getDisplayHeight())) ??
        (await optional(() => track.displayHeight)) ??
        0
    return { width, height }
}

/** ISOBMFF keeps its packet table in the moov, so packet stats cost no media reads. */
const ISOBMFF_CONTAINERS = new Set(["MP4", "QuickTime File Format"])

async function probeSource(
    file: File,
    mb: Mediabunny | null,
    loadError?: unknown
): Promise<SourceFacts> {
    const facts: SourceFacts = {
        fileType: file.type,
        extension: fileExtension(file.name),
        size: file.size,
        canEncodeInBrowser: canEncodeInBrowser(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }

    if (!mb) {
        facts.probeError = `mediabunny could not be loaded — ${describeError(loadError)}`
        return facts
    }

    let input: InstanceType<Mediabunny["Input"]> | null = null
    try {
        input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
        const source = input

        facts.container = await optional(async () => (await source.getFormat()).name)

        let video: InputVideoTrack | null
        try {
            video = await source.getPrimaryVideoTrack()
        } catch (err) {
            facts.probeError = describeError(err)
            return facts
        }
        facts.hasVideo = video !== null

        if (video) {
            const track = video
            facts.videoCodec = (await optional(() => track.getCodec())) ?? undefined
            facts.codecString = (await optional(() => track.getCodecParameterString())) ?? undefined
            facts.codedWidth = await optional(() => track.getCodedWidth())
            facts.codedHeight = await optional(() => track.getCodedHeight())
            const display = await displaySizeOf(track)
            facts.displayWidth = display.width || undefined
            facts.displayHeight = display.height || undefined
            facts.rotation = await optional(() => track.getRotation())
            facts.hdr = await optional(() => track.hasHighDynamicRange())
            facts.colorSpace = await optional(async () => {
                const space = await track.getColorSpace()
                return {
                    primaries: space.primaries,
                    transfer: space.transfer,
                    matrix: space.matrix,
                    fullRange: space.fullRange,
                }
            })
            if (facts.container && ISOBMFF_CONTAINERS.has(facts.container)) {
                const stats = await optional(() => track.computePacketStats())
                if (stats && stats.packetCount > 0) {
                    facts.bitrate = Math.round(stats.averageBitrate)
                    facts.bitrateSource = "packets"
                    facts.frameRate = Number(stats.averagePacketRate.toFixed(2))
                }
            }
        }

        facts.duration = await optional(() => source.computeDuration())
        facts.firstTimestamp = await optional(() => source.getFirstTimestamp())

        const audio = await optional(() => source.getPrimaryAudioTrack())
        if (audio !== undefined) facts.hasAudio = audio !== null
        if (audio) {
            facts.audioCodec = (await optional(() => audio.getCodec())) ?? undefined
            facts.sampleRate = await optional(() => audio.getSampleRate())
            facts.channels = await optional(() => audio.getNumberOfChannels())
        }

        // No packet stats (not ISOBMFF, or they threw): the whole file's rate
        // is a fair stand-in — it includes the audio, which only errs high.
        if (facts.bitrate === undefined && facts.duration && facts.duration > 0) {
            facts.bitrate = Math.round((file.size * 8) / facts.duration)
            facts.bitrateSource = "file size"
        }
    } catch (err) {
        facts.probeError ??= describeError(err)
    } finally {
        try {
            input?.dispose()
        } catch {
            /* disposal is best-effort */
        }
    }

    return facts
}

// ── The plan ──────────────────────────────────────────────────

export type PlannedStep = {
    name: VideoStepName
    /** Encodes: longest side of the output. */
    maxDimension?: number
    /** Encodes: target video bitrate. */
    bitrate?: number
    /**
     * Encodes: start at the earliest packet when it is negative, which keeps
     * AAC priming on the copy path (see {@link primingTrim}). Off for the
     * smaller encodes — one less unusual thing about a retry.
     */
    trim?: boolean
    /**
     * Run only when the normal encode's outcome calls for it, otherwise it is
     * recorded as skipped:
     *   - "encoded was too large": it produced a file over the cap.
     *   - "encoded produced nothing": it threw, was invalid, or never ran.
     */
    runIf?: "encoded was too large" | "encoded produced nothing"
}

/**
 * With a server to fall back on, the browser encodes only a clip this short.
 * A phone that takes minutes to encode a long clip — and may still fail at the
 * end of it — is better off uploading the original straight away.
 */
export const SERVER_FALLBACK_MAX_ENCODE_SECONDS = 90

/** Bitrate for the fit-to-cap encode: 92% of the cap over the clip, less the audio. */
export function fitBitrate(maxBytes: number, duration: number): number {
    return Math.max(
        MIN_FIT_BITRATE,
        Math.floor((maxBytes * BITRATE_FIT_HEADROOM * 8) / duration) - AUDIO_BITRATE
    )
}

/**
 * Every way this source could be made playable, in the order to try them.
 * Pure — facts in, steps out — so the ladder is testable without mediabunny.
 *
 *   1. fast path      MP4 + H.264, in bounds, under the cap → the file as-is.
 *   2. quick remux    H.264 in another box (an iPhone .mov), in bounds, under
 *                     the cap, ≤5 Mbps, no rotation → packets copied into MP4.
 *                     Lossless, seconds instead of a full encode. Rotation
 *                     would stay as metadata in a copy, and the primary paths
 *                     always bake it in, so a rotated clip is encoded.
 *   3. encoded        the full encode (needs WebCodecs).
 *   4. encoded (bitrate fit)  only when 3 came out over the cap.
 *   5. H.264 remux    only when 3 produced nothing: H.264 at any size, under
 *                     the cap, copied (rotation may stay as metadata — fine
 *                     for a fallback). Not planned when 2 was: same copy.
 *   6. encoded (smaller)  960, then 720, at 1.5 Mbps, no trim — less memory.
 *   7. HEVC remux     HEVC under the cap, copied (see ALLOW_HEVC_LAST_RESORT).
 *   8. original passed through  an mp4/webm original under the cap.
 *
 * A probe that failed outright plans only 8; a file with no video track
 * plans nothing.
 *
 * `serverFallback` keeps ONLY 1, 2, and 3 + 4 — those two only for a clip of
 * known duration ≤ {@link SERVER_FALLBACK_MAX_ENCODE_SECONDS}. Steps 5–8 exist
 * because nothing could convert the file once it left the phone; with the
 * server able to, the original goes to it instead.
 */
export function planVideoPrep(
    facts: SourceFacts,
    {
        maxBytes,
        allowHevcLastResort = ALLOW_HEVC_LAST_RESORT,
        serverFallback = false,
    }: { maxBytes: number; allowHevcLastResort?: boolean; serverFallback?: boolean }
): PlannedStep[] {
    if (facts.hasVideo === false) return []

    const probed = facts.hasVideo === true
    const fitsCap = facts.size !== undefined && facts.size <= maxBytes
    const longest =
        facts.displayWidth && facts.displayHeight
            ? Math.max(facts.displayWidth, facts.displayHeight)
            : undefined
    const inBounds = longest !== undefined && longest <= MAX_VIDEO_DIMENSION
    const isAvc = probed && facts.videoCodec === "avc"
    const isHevc = probed && facts.videoCodec === "hevc"
    const isMp4 = facts.fileType === "video/mp4"
    const canEncode = probed && facts.canEncodeInBrowser === true

    if (isAvc && isMp4 && inBounds && fitsCap) return [{ name: "fast path" }]

    const plan: PlannedStep[] = []

    const quickRemux =
        isAvc &&
        !isMp4 &&
        inBounds &&
        fitsCap &&
        (facts.bitrate === undefined || facts.bitrate <= QUICK_REMUX_MAX_BITRATE) &&
        (facts.rotation ?? 0) === 0
    if (quickRemux) plan.push({ name: "quick remux" })

    const encodeHere =
        canEncode &&
        (!serverFallback ||
            (facts.duration !== undefined &&
                facts.duration > 0 &&
                facts.duration <= SERVER_FALLBACK_MAX_ENCODE_SECONDS))

    if (encodeHere) {
        plan.push({
            name: "encoded",
            maxDimension: MAX_VIDEO_DIMENSION,
            bitrate: VIDEO_BITRATE,
            trim: true,
        })
        if (facts.duration && facts.duration > 0) {
            plan.push({
                name: "encoded (bitrate fit)",
                runIf: "encoded was too large",
                maxDimension: MAX_VIDEO_DIMENSION,
                bitrate: fitBitrate(maxBytes, facts.duration),
                trim: true,
            })
        }
    }

    if (serverFallback) return plan

    if (isAvc && fitsCap && !quickRemux) {
        plan.push({ name: "H.264 remux", runIf: "encoded produced nothing" })
    }

    if (canEncode) {
        for (const dimension of SMALLER_ENCODE_DIMENSIONS) {
            if (longest !== undefined && longest <= dimension) continue
            plan.push({
                name: "encoded (smaller)",
                maxDimension: dimension,
                bitrate: SMALLER_ENCODE_BITRATE,
                trim: false,
            })
        }
    }

    if (allowHevcLastResort && isHevc && fitsCap) plan.push({ name: "HEVC remux" })

    if (PASSTHROUGH_CONTENT_TYPES.has(facts.fileType ?? "") && fitsCap) {
        plan.push({ name: "original passed through" })
    }

    return plan
}

// ── Main entry ────────────────────────────────────────────────

/**
 * Make `file` into something every viewer can play: H.264/MP4, ≤1280 on the
 * longest side, ~2 Mbps, audio preserved, faststart, rotation baked in —
 * or, when that cannot be done here, the closest thing that still plays.
 *
 * Probe → {@link planVideoPrep} → run the steps in order, first success wins.
 * Between and inside steps, an abort rejects with {@link ENCODE_CANCELLED}.
 * {@link VideoAudioLostError} stops the ladder at once. Anything else a step
 * throws is recorded and the next step runs; when none is left, rejects with
 * a {@link VideoPrepareError} carrying the most specific code, the facts and
 * every step — reported to Sentry from here, once, for every flow.
 *
 * Every output is checked again after its step: under `maxBytes`, and an MP4
 * (or the mp4/webm original). A raw .mov never comes out of here.
 *
 * Duration is NOT checked here — callers run their own limit first, with their
 * own message, so an overlong clip fails before any of this work starts.
 */
export async function encodeVideo(
    file: File,
    opts: EncodeVideoOptions
): Promise<EncodedVideo> {
    const {
        maxBytes,
        onProgress,
        signal,
        allowSilentAudio = false,
        flow = "single",
        serverFallback = false,
    } = opts

    throwIfAborted(signal)

    const { mb, error: loadError } = await loadMediabunny()
    throwIfAborted(signal)

    const facts = await probeSource(file, mb, loadError)
    throwIfAborted(signal)

    const plan = planVideoPrep(facts, { maxBytes, serverFallback })
    const steps: StepRecord[] = []
    const ctx: StepContext = {
        mb,
        file,
        facts,
        maxBytes,
        onProgress,
        signal,
        allowSilentAudio,
        serverFallback,
    }

    for (const planned of plan) {
        throwIfAborted(signal)

        const skip = skipReason(planned, steps)
        if (skip) {
            steps.push({ name: planned.name, outcome: "skipped", reason: skip, ms: 0 })
            continue
        }

        const startedAt = Date.now()
        let outcome: StepOutcome
        try {
            outcome = await runStep(planned, ctx, steps)
        } catch (err) {
            if (signal?.aborted || isCancelledError(err)) throw cancelled()
            // Not a failure: a decision for the user, and every later step
            // would face the same sound.
            if (isVideoAudioLostError(err)) throw err
            steps.push({
                name: planned.name,
                outcome: "failed",
                ...failureFields(err),
                ms: Date.now() - startedAt,
            })
            continue
        }

        throwIfAborted(signal)
        const ms = Date.now() - startedAt

        // Checked here as well as in the step, so no step can hand back
        // something the bucket must not hold.
        if (outcome.kind === "ok" && outcome.video.blob.size > maxBytes) {
            outcome = { kind: "too_large", bytes: outcome.video.blob.size }
        }
        if (outcome.kind === "ok" && !PASSTHROUGH_CONTENT_TYPES.has(outcome.video.blob.type)) {
            steps.push({
                name: planned.name,
                outcome: "failed",
                code: "CONVERSION_INVALID",
                reason: `output type "${outcome.video.blob.type}" is not uploadable`,
                ms,
            })
            continue
        }

        if (outcome.kind === "too_large") {
            steps.push({
                name: planned.name,
                outcome: "failed",
                code: "TOO_LARGE",
                reason: `output was ${mb1(outcome.bytes)}MB, over the ${mb1(maxBytes)}MB limit`,
                outputBytes: outcome.bytes,
                ms,
            })
            continue
        }

        const { video } = outcome
        steps.push({
            name: planned.name,
            outcome: "ok",
            ...(outcome.note ? { reason: outcome.note } : {}),
            outputBytes: video.blob.size,
            ms,
        })
        logPath(video.path, outcome.note)

        if (video.path !== "fast path" && video.path !== "encoded") {
            reportVideoFallbackUsed(
                video.path === "HEVC remux" ? "hevc_last_resort" : video.path,
                facts,
                flow,
                steps
            )
        }

        onProgress?.(1)
        return video
    }

    // The server converts the original instead (videoPrep.ts). Nothing here
    // failed in a way anybody needs to hear about, so no report — the steps
    // still ride on the error, and development still prints them.
    if (serverFallback) {
        if (process.env.NODE_ENV === "development" && steps.length) {
            console.info("[videoEncode] handing the original to the server")
            console.table(steps)
        }
        throw new VideoPrepareError("SERVER_PREFERRED", { facts, steps })
    }

    const err = new VideoPrepareError(finalCode(facts, steps), { facts, steps })
    reportVideoPrepareFailure(err, { flow })
    throw err
}

/**
 * The most specific code the run supports: TOO_LARGE when something was made
 * and all of it was over the cap; the probe's own verdict when it had one;
 * otherwise the last step's failure — or, when nothing could even be tried,
 * the missing WebCodecs.
 */
function finalCode(facts: SourceFacts, steps: StepRecord[]): VideoPrepareCode {
    if (steps.some((s) => s.code === "TOO_LARGE")) return "TOO_LARGE"
    if (facts.hasVideo === false) return "NO_VIDEO_TRACK"
    if (facts.hasVideo === undefined) return "PROBE_FAILED"
    const lastFailure = [...steps].reverse().find((s) => s.outcome === "failed")
    if (lastFailure?.code) return lastFailure.code
    if (!facts.canEncodeInBrowser) return "NO_WEBCODECS"
    return "CONVERSION_FAILED"
}

function skipReason(planned: PlannedStep, steps: StepRecord[]): string | null {
    const encoded = steps.find((s) => s.name === "encoded")
    switch (planned.runIf) {
        case "encoded was too large":
            return encoded?.code === "TOO_LARGE" ? null : "the encode was not over the cap"
        case "encoded produced nothing":
            return encoded?.code === "TOO_LARGE"
                ? "the encode produced a file; a smaller encode is tried instead"
                : null
        default:
            return null
    }
}

function failureFields(err: unknown): Pick<StepRecord, "code" | "reason" | "errorName" | "errorMessage"> {
    if (err instanceof StepFailure) {
        const inner = err.inner
        return {
            code: err.code,
            reason: err.message,
            ...(inner instanceof Error
                ? { errorName: inner.name, errorMessage: inner.message }
                : inner !== undefined
                  ? { errorMessage: String(inner) }
                  : {}),
        }
    }
    return {
        code: "CONVERSION_FAILED",
        ...(err instanceof Error
            ? { errorName: err.name, errorMessage: err.message }
            : { errorMessage: String(err) }),
    }
}

// ── The steps ─────────────────────────────────────────────────

type StepContext = {
    mb: Mediabunny | null
    file: File
    facts: SourceFacts
    maxBytes: number
    onProgress?: EncodeProgress
    signal?: AbortSignal
    allowSilentAudio: boolean
    serverFallback: boolean
}

type StepOutcome =
    | { kind: "ok"; video: EncodedVideo; note?: string }
    | { kind: "too_large"; bytes: number }

const codecOf = (codec?: string): EncodedVideo["codec"] =>
    codec === "avc" || codec === "hevc" ? codec : "other"

function runStep(
    planned: PlannedStep,
    ctx: StepContext,
    steps: StepRecord[]
): Promise<StepOutcome> {
    switch (planned.name) {
        case "fast path":
        case "original passed through":
            return Promise.resolve({ kind: "ok", video: original(ctx, planned.name) })

        case "quick remux":
            return convert(ctx, { name: planned.name, mode: "copy", allowRotationMetadata: false })

        case "H.264 remux":
        case "HEVC remux":
            return convert(ctx, { name: planned.name, mode: "copy", allowRotationMetadata: true })

        case "encoded (bitrate fit)": {
            // The planned rate is the formula's; when the normal encode
            // overshot its own target by more than that, scale by how much it
            // overshot instead — asking for MORE than the rate that was just
            // too big would only make the same file again.
            const overshoot = steps.find((s) => s.name === "encoded")?.outputBytes
            const scaled = overshoot
                ? Math.floor((VIDEO_BITRATE * ctx.maxBytes * BITRATE_FIT_HEADROOM) / overshoot)
                : Infinity
            const bitrate = Math.max(MIN_FIT_BITRATE, Math.min(planned.bitrate ?? VIDEO_BITRATE, scaled))
            return convert(ctx, {
                name: planned.name,
                mode: "encode",
                maxDimension: planned.maxDimension ?? MAX_VIDEO_DIMENSION,
                bitrate,
                trim: planned.trim ?? true,
            })
        }

        case "encoded":
        case "encoded (smaller)":
            return convert(ctx, {
                name: planned.name,
                mode: "encode",
                maxDimension: planned.maxDimension ?? MAX_VIDEO_DIMENSION,
                bitrate: planned.bitrate ?? VIDEO_BITRATE,
                trim: planned.trim ?? true,
            })
    }
}

/**
 * The original, untouched — the fast path, or an mp4/webm the ladder could
 * do nothing better with. The probe already measured it, so the size and
 * duration are known rather than left at 0.
 */
function original(ctx: StepContext, path: VideoStepName): EncodedVideo {
    const { file, facts } = ctx
    return {
        blob: file,
        width: facts.displayWidth ?? 0,
        height: facts.displayHeight ?? 0,
        duration: Math.round(facts.duration ?? 0),
        wasReencoded: false,
        audioDropped: false,
        path,
        codec: path === "fast path" ? "avc" : codecOf(facts.videoCodec),
    }
}

/**
 * The original, when a step could not carry its sound but the file itself is
 * a container browsers play — or null when it is not (a .mov) or is over the
 * cap. Sound intact beats a smaller, silent file.
 *
 * Never with `serverFallback`: the server keeps the sound AND converts the
 * picture, so the VideoAudioLostError this lets through sends the original
 * there instead of uploading an unconverted file for good.
 */
function passthroughIfSafe(ctx: StepContext): EncodedVideo | null {
    const { file, maxBytes } = ctx
    if (ctx.serverFallback) return null
    if (!PASSTHROUGH_CONTENT_TYPES.has(file.type) || file.size > maxBytes) return null
    return original(ctx, "original passed through")
}

/**
 * Mediabunny copies audio packets only when no track starts BEFORE the
 * conversion does, and its default start is max(earliest packet, 0). AAC
 * priming — the edit list every iPhone recording carries — puts the first
 * audio packet a few ms before 0, so the audio "needs trimming" and is decoded
 * and re-encoded instead of copied; on a browser without an AAC codec that is
 * where the sound goes. Starting the conversion at that negative timestamp
 * keeps the copy path open — for the video packets of a remux too, which are
 * only copied when they do not start before the conversion either. Every
 * track is then shifted later by those few ms, which nobody can hear.
 */
async function primingTrim(
    input: InstanceType<Mediabunny["Input"]>
): Promise<{ start: number } | undefined> {
    const earliest = await input.getFirstTimestamp()
    return earliest < 0 ? { start: earliest } : undefined
}

type ConvertSpec =
    | {
          name: VideoStepName
          mode: "encode"
          maxDimension: number
          bitrate: number
          trim: boolean
      }
    | {
          name: VideoStepName
          /** Packets copied; nothing is decoded or encoded. */
          mode: "copy"
          allowRotationMetadata: boolean
      }

/** Why mediabunny dropped the video track, as a code. */
function videoDiscardCode(
    discarded: Array<{ track: { type: string }; reason: string }>
): VideoPrepareCode {
    switch (discarded.find((d) => d.track.type === "video")?.reason) {
        case "undecodable_source_codec":
            return "DECODE_UNSUPPORTED"
        case "no_encodable_target_codec":
            return "ENCODE_UNSUPPORTED"
        default:
            return "CONVERSION_INVALID"
    }
}

const discardSummary = (discarded: Array<{ track: { type: string }; reason: string }>) =>
    discarded.map((d) => `${d.track.type}: ${d.reason}`).join(", ") || "none discarded"

/**
 * One conversion — an encode or a packet copy — into a faststart MP4, under
 * the audio contract, with its own Input and Output disposed however it ends.
 *
 * AUDIO. `copy` asks for the source codec — with no `quality`, `bitrate`,
 * `sampleRate` or `numberOfChannels`, which are the options that force a
 * re-encode — for anything MP4 can carry, and AAC for the rest. When the
 * browser decoded the audio but had nothing to encode it with, the AAC WASM
 * encoder is loaded and the conversion rebuilt aimed at AAC. Still gone → an
 * mp4/webm original under the cap is handed back (sound intact); otherwise
 * {@link VideoAudioLostError}, unless the caller allowed silence. The output
 * bytes are re-opened and checked for an audio track before they are trusted.
 */
async function convert(ctx: StepContext, spec: ConvertSpec): Promise<StepOutcome> {
    const { mb, facts, maxBytes, onProgress, signal, allowSilentAudio } = ctx
    if (!mb) throw new StepFailure("PROBE_FAILED", "mediabunny is not loaded")

    const {
        ALL_FORMATS,
        BlobSource,
        BufferSource,
        BufferTarget,
        Conversion,
        EncodedAudioPacketSource,
        EncodedVideoPacketSource,
        Input,
        MP4,
        Mp4OutputFormat,
        Output,
        Quality,
        canEncodeVideo,
    } = mb

    type MbOutput = InstanceType<typeof Output>
    // Awaited<ReturnType<...>>, not InstanceType<>: Conversion's constructor is
    // private, so it has no public construct signature to instantiate a type from.
    type MbConversion = Awaited<ReturnType<typeof Conversion.init>>

    let conversion: MbConversion | null = null
    const outputs: MbOutput[] = []
    const onAbort = () => {
        // Fire-and-forget: cancel() makes the in-flight execute() reject, which
        // is what actually unwinds the step.
        void conversion?.cancel()
    }

    onProgress?.(0)

    const input = new Input({ source: new BlobSource(ctx.file), formats: ALL_FORMATS })

    try {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new StepFailure("NO_VIDEO_TRACK", "no video track")

        throwIfAborted(signal)

        // Known BEFORE the conversion is built, so a conversion that quietly
        // drops the sound can be told apart from a clip that never had any.
        const hasAudio = (await input.getPrimaryAudioTrack()) !== null

        // Display size already accounts for rotation metadata, so a portrait
        // clip recorded as 1920×1080-plus-90° reads as 1080×1920 here.
        const display = await displaySizeOf(track)
        const duration = facts.duration ?? (await optional(() => input.computeDuration())) ?? 0

        let width = display.width
        let height = display.height
        let video: ConversionVideoOptions

        if (spec.mode === "encode") {
            ;({ width, height } = fitWithin(display.width, display.height, spec.maxDimension))

            // Verify the encoder will take these parameters before committing
            // to a conversion — a browser with VideoEncoder but no H.264 (some
            // Linux Chromium builds) fails here, clearly, not mid-conversion.
            if (!(await canEncodeVideo("avc", { width, height }))) {
                throw new StepFailure("ENCODE_UNSUPPORTED", `no H.264 encoder for ${width}×${height}`)
            }

            video = {
                width,
                height,
                fit: "contain",
                codec: "avc",
                quality: new Quality({ bitrate: spec.bitrate }),
                keyFrameInterval: KEYFRAME_INTERVAL,
                // Bake rotation into the frames instead of leaving it in
                // metadata. Rotation metadata is honoured inconsistently —
                // Android Chrome and several in-app browsers ignore it —
                // which is how a portrait clip ends up sideways for half
                // its viewers.
                allowRotationMetadata: false,
            }
        } else {
            // A packet copy: none of the options that force a decode (size,
            // codec, quality, keyframes, crop) — mediabunny copies exactly
            // when there is nothing to change.
            video = { allowRotationMetadata: spec.allowRotationMetadata }
        }

        throwIfAborted(signal)

        const trim = spec.mode === "copy" || spec.trim ? await primingTrim(input) : undefined

        /**
         * Build a fresh conversion. A non-composable conversion owns its output,
         * so a rebuild (after registering the AAC encoder) needs a new one.
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
            outputs.push(output)

            const built = await Conversion.init({
                input,
                output,
                trim,
                // A copy carries the one picture and the one sound a viewer
                // plays — not a cinematic-mode depth track or a second audio
                // mix, either of which can make the MP4 refuse to build.
                ...(spec.mode === "copy" ? { tracks: "primary" as const } : {}),
                video,
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

        // Without a picture there is nothing to post, whatever happens to the
        // sound — and an audio-only conversion is still `isValid`.
        const outputVideo = output.tracks.find((t) => t.type === "video")
        if (!outputVideo) {
            throw new StepFailure(
                videoDiscardCode(built.discardedTracks),
                `the video track was discarded (${discardSummary(built.discardedTracks)})`
            )
        }
        if (spec.mode === "copy" && !(outputVideo.source instanceof EncodedVideoPacketSource)) {
            throw new StepFailure("CONVERSION_INVALID", "the video could not be copied without re-encoding it")
        }

        let audioDropped = false
        let audioPath: AudioPath = "no audio track"

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
                    if (audioKept()) audioPath = "AAC WASM fallback"
                } catch (err) {
                    if (signal?.aborted) throw cancelled()
                    if (isCancelledError(err)) throw err
                    // The download failed or the encoder refused the track —
                    // the conversion built first is still the one to fall back
                    // from, and the checks below decide what happens to it.
                }
            }

            if (!audioKept()) {
                const kept = passthroughIfSafe(ctx)
                if (kept) {
                    return { kind: "ok", video: kept, note: "audio track could not be kept; original passed through" }
                }
                if (!allowSilentAudio) throw new VideoAudioLostError()
                audioDropped = true
                audioPath = "silent by choice"
            } else if (audioPath !== "AAC WASM fallback") {
                const audioTrack = output.tracks.find((t) => t.type === "audio")
                audioPath =
                    audioTrack?.source instanceof EncodedAudioPacketSource
                        ? "audio copied"
                        : "audio re-encoded"
            }
        }

        if (!conversion.isValid) {
            throw new StepFailure(
                "CONVERSION_INVALID",
                `the conversion is invalid (${discardSummary(conversion.discardedTracks)})`
            )
        }

        // An abort during init (or the AAC download) has no listener yet to
        // cancel anything; catch it here rather than after a full conversion.
        throwIfAborted(signal)

        if (onProgress) {
            conversion.onProgress = (progress: number) => {
                // Clamped: mediabunny can report 1 before execute() resolves,
                // and a bar that sits at 100% mid-work reads as a hang.
                onProgress(Math.min(0.99, Math.max(0, progress)))
            }
        }

        signal?.addEventListener("abort", onAbort, { once: true })

        try {
            await conversion.execute()
        } catch (err) {
            if (signal?.aborted) throw cancelled()
            throw new StepFailure("CONVERSION_FAILED", "the conversion threw", err)
        }

        throwIfAborted(signal)

        const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer
        if (!buffer) throw new StepFailure("CONVERSION_FAILED", "the conversion produced no output")

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
                const kept = passthroughIfSafe(ctx)
                if (kept) {
                    return { kind: "ok", video: kept, note: "output had no audio; original passed through" }
                }
                if (!allowSilentAudio) throw new VideoAudioLostError()
                audioDropped = true
                audioPath = "silent by choice"
            }
        }

        const blob = new Blob([buffer], { type: "video/mp4" })

        // The encode can still overshoot the cap — a long, highly detailed clip
        // at a fixed bitrate. Not a failure of this step's machinery: the
        // ladder's next steps exist for exactly this.
        if (blob.size > maxBytes) return { kind: "too_large", bytes: blob.size }

        return {
            kind: "ok",
            note: audioPath,
            video: {
                blob,
                width,
                height,
                duration: Math.round(duration),
                wasReencoded: spec.mode === "encode",
                audioDropped,
                path: spec.name,
                codec: spec.mode === "encode" ? "avc" : codecOf(facts.videoCodec),
            },
        }
    } finally {
        signal?.removeEventListener("abort", onAbort)
        // Releases the encoders of an output that never finished — the one
        // abandoned for the AAC rebuild, or one whose conversion threw.
        for (const output of outputs) {
            if (output.state === "pending" || output.state === "started") {
                void output.cancel().catch(() => {})
            }
        }
        // Releases the reader and any decoder the input still holds. Without
        // this, every failed step would leak a WebCodecs decoder into the next.
        try {
            input.dispose()
        } catch {
            /* disposal is best-effort — never mask the real outcome */
        }
    }
}

// ── Poster frames ─────────────────────────────────────────────

export type PosterMode = "feed" | "highlight"

export type CapturePosterOptions = {
    mode?: PosterMode
    /** Which composer this is, for Sentry. */
    flow?: UploadFlow
    /**
     * The video's display size, when the caller knows it (the encoder does).
     * Only the placeholder uses it, to keep the video's shape.
     */
    size?: { width: number; height: number }
}

/**
 * A poster frame as WebP — or JPEG on a browser that cannot write WebP — under
 * {@link POSTER_MAX_BYTES}.
 *
 * Nothing generates poster frames server-side, and the attach endpoints REQUIRE
 * a thumbnail for every video, so a poster that cannot be made would block the
 * post. It never does:
 *
 *   1. A frame from a `<video>` element on the blob being uploaded, chosen by
 *      {@link grabVideoFrame} so it is really decoded and not a black one.
 *   2. That failing (or timing out — mobile Safari can leave a blob-sourced
 *      `<video>` in limbo), one frame decoded with mediabunny's CanvasSink, from
 *      the same moments with the same black check, through the same byte budget.
 *   3. Still nothing: a placeholder — the app's dark surface at the video's
 *      aspect ratio (720×1280 when unknown) — reported as a fallback.
 *
 * Rejects with a {@link VideoPrepareError} (`POSTER_FAILED`) only when even
 * the placeholder cannot be encoded.
 *
 * - `feed`      — intrinsic aspect, longest side ≤1280.
 * - `highlight` — 9:16 cover-crop at 360×640, the shape the rail tile expects.
 */
export async function capturePoster(
    source: Blob,
    { mode = "feed", flow = "single", size }: CapturePosterOptions = {}
): Promise<Blob> {
    const steps: StepRecord[] = []
    const known: { width?: number; height?: number } = { ...size }

    const attempt = async (
        name: PosterStepName,
        run: () => Promise<Blob>
    ): Promise<Blob | null> => {
        const startedAt = Date.now()
        try {
            const blob = await run()
            steps.push({ name, outcome: "ok", outputBytes: blob.size, ms: Date.now() - startedAt })
            return blob
        } catch (err) {
            steps.push({
                name,
                outcome: "failed",
                ...(err instanceof Error
                    ? { errorName: err.name, errorMessage: err.message }
                    : { errorMessage: String(err) }),
                ms: Date.now() - startedAt,
            })
            return null
        }
    }

    const fromElement = await attempt("poster (video element)", () =>
        captureFromElement(source, mode)
    )
    if (fromElement) return fromElement

    const fromFrames = await attempt("poster (frame sink)", () =>
        captureFromFrameSink(source, mode, known)
    )
    if (fromFrames) return fromFrames

    const facts: SourceFacts = {
        fileType: source.type,
        size: source.size,
        displayWidth: known.width || undefined,
        displayHeight: known.height || undefined,
        canEncodeInBrowser: canEncodeInBrowser(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    }

    const placeholder = await attempt("poster (placeholder)", () =>
        encodePoster(placeholderFrame(known), mode)
    )
    if (placeholder) {
        reportVideoFallbackUsed("poster_placeholder", facts, flow, steps)
        return placeholder
    }

    const err = new VideoPrepareError("POSTER_FAILED", { facts, steps })
    reportVideoPrepareFailure(err, { flow })
    throw err
}

/** Matches the probe timeouts in chatUpload.service.ts. */
const POSTER_TIMEOUT_MS = 8000

const POSTER_READ_FAILED_MESSAGE = "Couldn't read a frame from that video."

/**
 * Step 1: a `<video>` element. On a stall or a refusal it hands over to the next
 * step rather than hang the upload. Grabbed at ≤1280 so a phone does not hold a
 * 4K canvas while the byte budget works out the size.
 */
async function captureFromElement(source: Blob, mode: PosterMode): Promise<Blob> {
    const frame = await grabVideoFrame(source, {
        maxSide: POSTER_DIMENSION_STEPS[0],
        timeoutMs: POSTER_TIMEOUT_MS,
    })
    if (!frame) throw new Error(`${POSTER_READ_FAILED_MESSAGE} (no frame from the video element)`)
    return encodePoster({ image: frame.canvas, width: frame.width, height: frame.height }, mode)
}

/**
 * Step 2: one frame decoded straight out of the blob with mediabunny — no
 * `<video>` element involved — from the same moments as step 1, with the same
 * black check. Decoded at ≤1280 on the longest side so a phone does not hold a
 * 4K frame for a poster. Records the track's display size in `known` for the
 * placeholder, even when the decode itself fails.
 */
async function captureFromFrameSink(
    source: Blob,
    mode: PosterMode,
    known: { width?: number; height?: number }
): Promise<Blob> {
    const mb = await import("mediabunny")
    const input = new mb.Input({ source: new mb.BlobSource(source), formats: mb.ALL_FORMATS })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${POSTER_READ_FAILED_MESSAGE} (frame decode timed out)`)),
            POSTER_TIMEOUT_MS
        )
    })

    const decode = async (): Promise<Blob> => {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new Error("no video track")

        const display = await displaySizeOf(track)
        if (display.width && display.height) {
            known.width ||= display.width
            known.height ||= display.height
        }

        const first = (await optional(() => track.getFirstTimestamp())) ?? 0
        const duration = (await optional(() => track.computeDuration())) ?? 0
        const moments = frameCandidateTimes(Math.max(0, duration - first)).map((time) => first + time)

        const { width, height } = fitWithin(display.width, display.height, POSTER_DIMENSION_STEPS[0])
        const sink = new mb.CanvasSink(track, { width, height, fit: "contain" })

        let chosen: PosterFrame | null = null
        let brightest = -1
        for (const at of moments) {
            const wrapped = await sink.getCanvas(at).catch((err: unknown) => {
                // A later moment failing does not undo an earlier dark frame.
                if (!chosen) throw err
                return null
            })
            if (!wrapped) continue

            const { canvas } = wrapped
            const frame: PosterFrame = { image: canvas, width: canvas.width, height: canvas.height }
            const luma = measureFrameLuma(canvas)
            if (!luma || !isBlackLuma(luma)) {
                chosen = frame
                break
            }
            if (luma.average > brightest) {
                brightest = luma.average
                chosen = frame
            }
        }
        if (!chosen) {
            const wrapped = await sink.getCanvas(first)
            if (!wrapped) throw new Error("no decodable frame")
            const { canvas } = wrapped
            chosen = { image: canvas, width: canvas.width, height: canvas.height }
        }

        return encodePoster(chosen, mode)
    }

    try {
        return await Promise.race([decode(), timeout])
    } finally {
        clearTimeout(timer)
        // Closes the decoder too, including one a timed-out decode left open.
        try {
            input.dispose()
        } catch {
            /* best-effort */
        }
    }
}

/** Step 3: the app's dark surface at the video's shape. */
function placeholderFrame(size: { width?: number; height?: number }): PosterFrame {
    const { width, height } =
        size.width && size.height
            ? fitWithin(size.width, size.height, POSTER_DIMENSION_STEPS[0])
            : { width: POSTER_PLACEHOLDER_WIDTH, height: POSTER_PLACEHOLDER_HEIGHT }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2D canvas for the placeholder")
    ctx.fillStyle = POSTER_PLACEHOLDER_COLOR
    ctx.fillRect(0, 0, width, height)

    return { image: canvas, width, height }
}

/** Something a poster can be drawn from, with its intrinsic size. */
type PosterFrame = {
    image: CanvasImageSource
    width: number
    height: number
}

/**
 * Paint the frame at the size `mode` wants, bounded by `maxDimension` on the
 * longest side for `feed` (ignored for the fixed-size highlight tile).
 */
function drawPosterFrame(
    frame: PosterFrame,
    mode: PosterMode,
    maxDimension: number
): HTMLCanvasElement {
    const { image, width: vw, height: vh } = frame
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
            image,
            (canvas.width - dw) / 2,
            (canvas.height - dh) / 2,
            dw,
            dh
        )
    } else {
        const { width, height } = fitWithin(vw, vh, maxDimension)
        canvas.width = width
        canvas.height = height
        ctx.drawImage(image, 0, 0, width, height)
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
async function encodePoster(frame: PosterFrame, mode: PosterMode): Promise<Blob> {
    let type: LossyImageType = (await canEncodeWebP())
        ? "image/webp"
        : "image/jpeg"

    // The highlight tile is a fixed 360×640, so only quality can give.
    const dimensions: readonly number[] =
        mode === "highlight" ? [HIGHLIGHT_POSTER_HEIGHT] : POSTER_DIMENSION_STEPS

    for (const maxDimension of dimensions) {
        const canvas = drawPosterFrame(frame, mode, maxDimension)

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
            if (blob.type !== type) {
                throw new Error(`the canvas wrote ${blob.type || "nothing"} when asked for ${type}`)
            }

            if (blob.size <= POSTER_MAX_BYTES) {
                logPoster(blob, canvas.width, canvas.height, quality)
                return blob
            }
        }
    }

    throw new Error(`the poster stayed over ${kb(POSTER_MAX_BYTES)}KB at every size`)
}

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

/** MB to one decimal, for step reasons — "80.4MB", not a rounded "80MB". */
const mb1 = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10
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
 * caller can label the encode half ({@link OPTIMIZING_LABEL}) without tracking the
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
