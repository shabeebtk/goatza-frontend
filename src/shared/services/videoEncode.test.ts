// @vitest-environment jsdom

/**
 * `encodeVideo` against a fake mediabunny: the audio contract, the ladder,
 * and what Sentry hears.
 *
 * The fake mirrors the rules of `Conversion` that matter here. Audio packets
 * are copied only when the options carry no `quality`/`bitrate`, the codec
 * matches the source, and no track starts before the conversion does; video
 * packets are copied only when the options ask for nothing (no size, codec,
 * quality or keyframes). Everything else — which tracks get discarded,
 * whether the AAC extension is available, whether the output bytes carry an
 * audio track, which conversions throw and how big their output is — is a
 * knob on `state`, so each test describes one browser and one file.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

type DiscardReason =
    | "no_encodable_target_codec"
    | "undecodable_source_codec"
    | null

type Init = Record<string, unknown> & {
    video?: Record<string, unknown>
    tracks?: string
}

const state = vi.hoisted(() => ({
    /** null = the source has no audio track at all. */
    sourceAudioCodec: "aac" as string | null,
    /** Earliest packet timestamp across the tracks (AAC priming is < 0). */
    earliest: 0,
    /** Why the audio track is dropped at init — before the AAC extension. */
    discardReason: null as DiscardReason,
    /** Whether the rebuild, with the AAC extension registered, drops it too. */
    discardAfterAac: false,
    /** Override for the audio check on the output bytes; null = truthful. */
    outputHasAudio: null as boolean | null,
    /** The source's video track; null = none at all. */
    video: {
        codec: "hevc",
        width: 1920,
        height: 1080,
        rotation: 0,
        bitrate: 8_000_000,
    } as { codec: string; width: number; height: number; rotation: number; bitrate: number } | null,
    container: "QuickTime File Format",
    /** Thrown by `getPrimaryVideoTrack` on the source — a file that will not parse. */
    probeThrows: false,
    /** Return an Error to make that conversion's execute() throw. */
    failExecute: null as ((init: Init) => Error | null) | null,
    /** Size of the bytes a conversion writes. */
    outputBytes: (() => 4096) as (init: Init) => number,
    /** Called inside every execute(), before it finishes. */
    duringExecute: null as ((init: Init) => void) | null,
    /** Everything `Conversion.init` was called with, in order. */
    inits: [] as Init[],
    /** Every Input built, source and output alike. */
    inputs: [] as Array<{ disposed: boolean; fromOutput: boolean }>,
    /** Every `Input` built from the OUTPUT buffer (the post-encode check). */
    outputChecks: 0,
    executed: 0,
    aacRegistered: false,
    lastOutputHadAudio: false,
}))

const sentry = vi.hoisted(() => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
}))
vi.mock("@sentry/nextjs", () => sentry)

vi.mock("@mediabunny/aac-encoder", () => ({
    registerAacEncoder: vi.fn(() => {
        state.aacRegistered = true
    }),
}))

vi.mock("mediabunny", () => {
    class FakeVideoTrack {
        type = "video" as const
        get displayWidth() {
            return state.video!.width
        }
        get displayHeight() {
            return state.video!.height
        }
        async getCodec() {
            return state.video!.codec
        }
        async getDisplayWidth() {
            return state.video!.width
        }
        async getDisplayHeight() {
            return state.video!.height
        }
        async getRotation() {
            return state.video!.rotation
        }
        async computePacketStats() {
            return { packetCount: 300, averagePacketRate: 30, averageBitrate: state.video!.bitrate }
        }
    }

    class FakeAudioTrack {
        type = "audio" as const
        async getCodec() {
            return state.sourceAudioCodec
        }
    }

    class BlobSource {
        constructor(public blob: Blob) {}
    }
    class BufferSource {
        constructor(public buffer: ArrayBuffer) {}
    }
    class BufferTarget {
        buffer: ArrayBuffer | null = null
    }
    class Mp4OutputFormat {
        constructor(public options: unknown) {}
    }
    class Quality {
        constructor(public options: { bitrate?: number }) {}
    }
    class EncodedAudioPacketSource {}
    class AudioSampleSource {}
    class EncodedVideoPacketSource {}
    class VideoSampleSource {}

    class Output {
        tracks: Array<{ type: "video" | "audio"; source: unknown }> = []
        target: BufferTarget
        constructor(options: { target: BufferTarget }) {
            this.target = options.target
        }
    }

    class Input {
        readonly fromOutput: boolean
        disposed = false
        constructor(options: { source: unknown }) {
            this.fromOutput = options.source instanceof BufferSource
            if (this.fromOutput) state.outputChecks++
            state.inputs.push(this)
        }
        async getFormat() {
            return { name: this.fromOutput ? "MP4" : state.container }
        }
        async getPrimaryVideoTrack() {
            if (!this.fromOutput && state.probeThrows) {
                throw new Error("Input has an unsupported or unrecognizable format.")
            }
            return state.video ? new FakeVideoTrack() : null
        }
        async getPrimaryAudioTrack() {
            const has = this.fromOutput
                ? (state.outputHasAudio ?? state.lastOutputHadAudio)
                : state.sourceAudioCodec !== null
            return has ? new FakeAudioTrack() : null
        }
        async computeDuration() {
            return 12.4
        }
        async getFirstTimestamp() {
            return state.earliest
        }
        dispose() {
            this.disposed = true
        }
    }

    type AudioOptions = { codec?: string; quality?: unknown }

    /** A copy asks for nothing; anything that changes the frames is an encode. */
    const isVideoCopy = (video?: Record<string, unknown>) =>
        !video?.codec && !video?.quality && !video?.width && video?.keyFrameInterval === undefined

    class Conversion {
        isValid = false
        discardedTracks: Array<{
            track: FakeAudioTrack
            reason: string
            trackOptions: AudioOptions
        }> = []
        onProgress: ((p: number) => void) | null = null

        private constructor(
            readonly output: Output,
            readonly init: Init
        ) {}

        static async init(options: Init & {
            output: Output
            trim?: { start?: number }
            audio: (track: FakeAudioTrack, n: number) => Promise<AudioOptions>
        }) {
            state.inits.push(options)
            const conversion = new Conversion(options.output, options)

            options.output.tracks.push({
                type: "video",
                source: isVideoCopy(options.video)
                    ? new EncodedVideoPacketSource()
                    : new VideoSampleSource(),
            })

            if (state.sourceAudioCodec !== null) {
                const audioOptions = await options.audio(new FakeAudioTrack(), 1)
                const reason = state.aacRegistered
                    ? state.discardAfterAac
                        ? state.discardReason
                        : null
                    : state.discardReason

                if (reason) {
                    conversion.discardedTracks.push({
                        track: new FakeAudioTrack(),
                        reason,
                        trackOptions: audioOptions,
                    })
                } else {
                    // mediabunny's copy conditions, reduced to what is varied here.
                    const start =
                        options.trim?.start ?? Math.max(state.earliest, 0)
                    const needsTrimming = state.earliest < start
                    const copies =
                        !audioOptions.quality &&
                        (!audioOptions.codec ||
                            audioOptions.codec === state.sourceAudioCodec) &&
                        !needsTrimming
                    options.output.tracks.push({
                        type: "audio",
                        source: copies
                            ? new EncodedAudioPacketSource()
                            : new AudioSampleSource(),
                    })
                }
            }

            conversion.isValid = options.output.tracks.length > 0
            return conversion
        }

        async execute() {
            state.executed++
            this.onProgress?.(0.5)
            state.duringExecute?.(this.init)
            const failure = state.failExecute?.(this.init)
            if (failure) throw failure
            this.output.target.buffer = new ArrayBuffer(state.outputBytes(this.init))
            state.lastOutputHadAudio = this.output.tracks.some(
                (t) => t.type === "audio"
            )
        }

        async cancel() {}
    }

    return {
        ALL_FORMATS: [],
        MP4: { name: "MP4" },
        BlobSource,
        BufferSource,
        BufferTarget,
        Conversion,
        EncodedAudioPacketSource,
        EncodedVideoPacketSource,
        AudioSampleSource,
        Input,
        Mp4OutputFormat,
        Output,
        Quality,
        canEncodeVideo: vi.fn(async () => true),
    }
})

const MAX = 80 * 1024 * 1024

const movFile = () =>
    new File([new Uint8Array(1024)], "clip.mov", { type: "video/quicktime" })
const mp4File = () =>
    new File([new Uint8Array(1024)], "clip.mp4", { type: "video/mp4" })

type Encoder = typeof import("./videoEncode")

let mod: Encoder

beforeEach(async () => {
    state.sourceAudioCodec = "aac"
    state.earliest = 0
    state.discardReason = null
    state.discardAfterAac = false
    state.outputHasAudio = null
    state.video = { codec: "hevc", width: 1920, height: 1080, rotation: 0, bitrate: 8_000_000 }
    state.container = "QuickTime File Format"
    state.probeThrows = false
    state.failExecute = null
    state.outputBytes = () => 4096
    state.duringExecute = null
    state.inits = []
    state.inputs = []
    state.outputChecks = 0
    state.executed = 0
    state.aacRegistered = false
    state.lastOutputHadAudio = false
    sentry.captureException.mockClear()
    sentry.captureMessage.mockClear()

    // WebCodecs is what `canEncodeInBrowser` looks for; jsdom has neither.
    Object.assign(window, {
        VideoEncoder: function VideoEncoder() {},
        VideoDecoder: function VideoDecoder() {},
    })

    // A fresh module per test: the AAC extension is registered once per page
    // and remembered at module level, which is exactly what one test checks.
    vi.resetModules()
    mod = await import("./videoEncode")
    const aac = await import("@mediabunny/aac-encoder")
    vi.mocked(aac.registerAacEncoder).mockClear()
    const mb = await import("mediabunny")
    vi.mocked(mb.canEncodeVideo).mockReset()
    vi.mocked(mb.canEncodeVideo).mockResolvedValue(true)
})

const audioOptionsOf = async (init: Record<string, unknown>) => {
    const audio = init.audio as (
        track: unknown,
        n: number
    ) => Promise<{ codec?: string; quality?: unknown }>
    return audio({ getCodec: async () => state.sourceAudioCodec }, 1)
}

/** The width an encode was asked for — 1280 is the normal encode, 960/720 the smaller ones. */
const widthOf = (init: Init) => init.video?.width as number | undefined
const isEncode = (init: Init) => Boolean(init.video?.codec)

describe("encodeVideo — audio", () => {
    it("copies the audio packets when the source codec can ship in MP4 as-is", async () => {
        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(result.wasReencoded).toBe(true)
        expect(result.audioDropped).toBe(false)
        expect(state.inits).toHaveLength(1)

        // No quality/bitrate, codec = source codec: mediabunny's copy path.
        const audio = await audioOptionsOf(state.inits[0])
        expect(audio).toEqual({ codec: "aac" })

        const output = state.inits[0].output as {
            tracks: Array<{ type: string; source: unknown }>
        }
        const mb = await import("mediabunny")
        const audioTrack = output.tracks.find((t) => t.type === "audio")
        expect(audioTrack?.source).toBeInstanceOf(mb.EncodedAudioPacketSource)

        // Nothing started before 0, so nothing to trim.
        expect(state.inits[0].trim).toBeUndefined()
        expect(state.aacRegistered).toBe(false)
    })

    it("starts the conversion at a negative first timestamp so priming does not force a re-encode", async () => {
        state.earliest = -0.0213

        await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(state.inits[0].trim).toEqual({ start: -0.0213 })

        const mb = await import("mediabunny")
        const output = state.inits[0].output as {
            tracks: Array<{ type: string; source: unknown }>
        }
        expect(
            output.tracks.find((t) => t.type === "audio")?.source
        ).toBeInstanceOf(mb.EncodedAudioPacketSource)
    })

    it("re-encodes to AAC when the source codec cannot ship in MP4", async () => {
        state.sourceAudioCodec = "opus"

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(result.audioDropped).toBe(false)
        const audio = await audioOptionsOf(state.inits[0])
        expect(audio.codec).toBe("aac")
        expect(audio.quality).toBeDefined()
    })

    it("loads the AAC encoder when the audio track has no encodable target codec", async () => {
        state.discardReason = "no_encodable_target_codec"

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        const aac = await import("@mediabunny/aac-encoder")
        expect(aac.registerAacEncoder).toHaveBeenCalledTimes(1)

        // Built again, everything aimed at AAC this time.
        expect(state.inits).toHaveLength(2)
        const audio = await audioOptionsOf(state.inits[1])
        expect(audio.codec).toBe("aac")
        expect(audio.quality).toBeDefined()

        expect(result.wasReencoded).toBe(true)
        expect(result.audioDropped).toBe(false)
        expect(state.executed).toBe(1)
    })

    it("registers the AAC encoder once per page", async () => {
        state.discardReason = "no_encodable_target_codec"

        await mod.encodeVideo(movFile(), { maxBytes: MAX })

        // Pretend the fake forgot the registration: the module must NOT call
        // `registerAacEncoder` again, so the rebuild still drops the audio and
        // the .mov is refused rather than re-registered into working.
        state.aacRegistered = false
        await expect(
            mod.encodeVideo(movFile(), { maxBytes: MAX })
        ).rejects.toBeInstanceOf(mod.VideoAudioLostError)

        const aac = await import("@mediabunny/aac-encoder")
        expect(aac.registerAacEncoder).toHaveBeenCalledTimes(1)
        expect(state.inits).toHaveLength(4)
    })

    it("passes an mp4 original through when the audio is still lost after the fallback", async () => {
        state.discardReason = "no_encodable_target_codec"
        state.discardAfterAac = true
        const file = mp4File()

        const result = await mod.encodeVideo(file, { maxBytes: MAX })

        expect(result.blob).toBe(file)
        expect(result.wasReencoded).toBe(false)
        expect(result.audioDropped).toBe(false)
        // The original is measured already; keep the duration for the attach.
        expect(result.duration).toBe(12)
        expect(state.executed).toBe(0)
    })

    it("does not load the AAC encoder for audio the browser cannot decode", async () => {
        state.discardReason = "undecodable_source_codec"
        const file = mp4File()

        const result = await mod.encodeVideo(file, { maxBytes: MAX })

        expect(state.aacRegistered).toBe(false)
        expect(state.inits).toHaveLength(1)
        expect(result.blob).toBe(file)
    })

    it("refuses a .mov whose sound would be lost", async () => {
        state.discardReason = "no_encodable_target_codec"
        state.discardAfterAac = true

        const attempt = mod.encodeVideo(movFile(), { maxBytes: MAX })

        await expect(attempt).rejects.toBeInstanceOf(mod.VideoAudioLostError)
        await expect(attempt).rejects.toMatchObject({
            code: mod.VIDEO_AUDIO_LOST,
            message: mod.VIDEO_AUDIO_LOST_MESSAGE,
        })
        expect(state.executed).toBe(0)
    })

    it("refuses an mp4 original over the cap whose sound would be lost", async () => {
        state.discardReason = "undecodable_source_codec"
        const big = new File([new Uint8Array(2048)], "clip.mp4", {
            type: "video/mp4",
        })

        await expect(
            mod.encodeVideo(big, { maxBytes: 1024 })
        ).rejects.toBeInstanceOf(mod.VideoAudioLostError)
    })

    it("continues without sound when the caller allows it", async () => {
        state.discardReason = "no_encodable_target_codec"
        state.discardAfterAac = true

        const result = await mod.encodeVideo(movFile(), {
            maxBytes: MAX,
            allowSilentAudio: true,
        })

        expect(result.wasReencoded).toBe(true)
        expect(result.audioDropped).toBe(true)
        expect(result.blob.type).toBe("video/mp4")
        expect(state.executed).toBe(1)
        // Nothing to verify on the output: the drop was agreed to.
        expect(state.outputChecks).toBe(0)
    })

    it("checks the encoded bytes for an audio track", async () => {
        state.outputHasAudio = false

        await expect(
            mod.encodeVideo(movFile(), { maxBytes: MAX })
        ).rejects.toBeInstanceOf(mod.VideoAudioLostError)
        expect(state.outputChecks).toBe(1)

        state.outputChecks = 0
        const file = mp4File()
        const result = await mod.encodeVideo(file, { maxBytes: MAX })
        expect(result.blob).toBe(file)
        expect(result.wasReencoded).toBe(false)
    })

    it("leaves a source with no audio track alone", async () => {
        state.sourceAudioCodec = null
        // Would matter if the audio branch ran; it must not.
        state.discardReason = "no_encodable_target_codec"

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(result.wasReencoded).toBe(true)
        expect(result.audioDropped).toBe(false)
        expect(state.inits).toHaveLength(1)
        expect(state.aacRegistered).toBe(false)
        expect(state.outputChecks).toBe(0)
    })

    it("says why, with a code, for a file that cannot be made playable", async () => {
        // No H.264 encoder at any size, and a file over the cap, so no copy
        // or passthrough can stand in for the encode.
        const mb = await import("mediabunny")
        vi.mocked(mb.canEncodeVideo).mockResolvedValue(false)
        const big = new File([new Uint8Array(2048)], "clip.mov", { type: "video/quicktime" })

        const attempt = mod.encodeVideo(big, { maxBytes: 1024 })

        await expect(attempt).rejects.toBeInstanceOf(mod.VideoPrepareError)
        await expect(attempt).rejects.toMatchObject({
            code: "ENCODE_UNSUPPORTED",
            message:
                "This video couldn't be converted on this device. Try a shorter clip, or post it from a computer (VIDEO_ENCODE_UNSUPPORTED)",
        })
        // The old bare message is kept exported, and never thrown.
        await expect(attempt).rejects.not.toThrow(mod.VIDEO_UNSUPPORTED_MESSAGE)
    })

    it("isVideoAudioLostError matches the error and nothing else", () => {
        expect(mod.isVideoAudioLostError(new mod.VideoAudioLostError())).toBe(true)
        expect(
            mod.isVideoAudioLostError(new Error(mod.VIDEO_UNSUPPORTED_MESSAGE))
        ).toBe(false)
        expect(mod.isVideoAudioLostError("nope")).toBe(false)
    })
})

// ── The plan ──────────────────────────────────────────────────

type Facts = import("./videoEncode").SourceFacts

/** The iPhone clip from the bug report: 22s, 1080×1920, 7 Mbps H.264 in a .mov. */
const facts = (over: Partial<Facts> = {}): Facts => ({
    fileType: "video/quicktime",
    extension: "mov",
    size: 20 * 1024 * 1024,
    duration: 22,
    container: "QuickTime File Format",
    videoCodec: "avc",
    displayWidth: 1080,
    displayHeight: 1920,
    rotation: 0,
    bitrate: 7_000_000,
    frameRate: 30,
    hasVideo: true,
    hasAudio: true,
    canEncodeInBrowser: true,
    ...over,
})

const names = (plan: Array<{ name: string }>) => plan.map((s) => s.name)

describe("planVideoPrep", () => {
    const plan = (f: Facts, maxBytes = MAX) => names(mod.planVideoPrep(f, { maxBytes }))

    it("mp4/avc/720p → fast path only", () => {
        expect(
            plan(facts({ fileType: "video/mp4", container: "MP4", displayWidth: 1280, displayHeight: 720, bitrate: 2_000_000 }))
        ).toEqual(["fast path"])
    })

    it("mov/avc/720×1280/2 Mbps → quick remux first", () => {
        const steps = plan(facts({ displayWidth: 720, displayHeight: 1280, bitrate: 2_000_000 }))
        expect(steps[0]).toBe("quick remux")
        expect(steps).toContain("encoded")
        // The same packet copy is not planned twice.
        expect(steps).not.toContain("H.264 remux")
    })

    it("mov/avc/1080×1920/7 Mbps → encoded, then H.264 remux", () => {
        expect(plan(facts())).toEqual([
            "encoded",
            "encoded (bitrate fit)",
            "H.264 remux",
            "encoded (smaller)",
            "encoded (smaller)",
        ])
    })

    it("a rotated H.264 .mov is encoded, never quick-remuxed (rotation would stay metadata)", () => {
        const steps = plan(facts({ displayWidth: 720, displayHeight: 1280, bitrate: 2_000_000, rotation: 90 }))
        expect(steps[0]).toBe("encoded")
        expect(steps).toContain("H.264 remux")
    })

    it("a bitrate over 5 Mbps is encoded rather than quick-remuxed", () => {
        const steps = plan(facts({ displayWidth: 720, displayHeight: 1280, bitrate: 6_000_000 }))
        expect(steps).not.toContain("quick remux")
        expect(steps).toContain("H.264 remux")
    })

    it("hevc 4K 60 fps → encoded, smaller, HEVC remux", () => {
        const steps = mod.planVideoPrep(
            facts({ videoCodec: "hevc", displayWidth: 2160, displayHeight: 3840, frameRate: 60, bitrate: 40_000_000, size: 60 * 1024 * 1024 }),
            { maxBytes: MAX }
        )
        expect(names(steps)).toEqual([
            "encoded",
            "encoded (bitrate fit)",
            "encoded (smaller)",
            "encoded (smaller)",
            "HEVC remux",
        ])
        const smaller = steps.filter((s) => s.name === "encoded (smaller)")
        expect(smaller.map((s) => s.maxDimension)).toEqual([960, 720])
        expect(smaller.every((s) => s.bitrate === 1_500_000 && s.trim === false)).toBe(true)
    })

    it("webm/vp9 → encoded, then passthrough", () => {
        const steps = plan(
            facts({ fileType: "video/webm", extension: "webm", container: "WebM", videoCodec: "vp9", displayWidth: 1920, displayHeight: 1080 })
        )
        expect(steps[0]).toBe("encoded")
        expect(steps[steps.length - 1]).toBe("original passed through")
        expect(steps).not.toContain("HEVC remux")
    })

    it("over-cap source with no remux possible → encode tiers only", () => {
        expect(
            plan(facts({ videoCodec: "hevc", displayWidth: 3840, displayHeight: 2160, size: 200 * 1024 * 1024 }))
        ).toEqual(["encoded", "encoded (bitrate fit)", "encoded (smaller)", "encoded (smaller)"])
    })

    it("ALLOW_HEVC_LAST_RESORT false → no HEVC remux", () => {
        expect(mod.ALLOW_HEVC_LAST_RESORT).toBe(true)
        const hevc = facts({ videoCodec: "hevc", displayWidth: 3840, displayHeight: 2160 })
        expect(names(mod.planVideoPrep(hevc, { maxBytes: MAX }))).toContain("HEVC remux")
        expect(
            names(mod.planVideoPrep(hevc, { maxBytes: MAX, allowHevcLastResort: false }))
        ).not.toContain("HEVC remux")
    })

    it("without WebCodecs, plans only what needs none of it", () => {
        expect(plan(facts({ canEncodeInBrowser: false }))).toEqual(["H.264 remux"])
        expect(plan(facts({ canEncodeInBrowser: false, size: 200 * 1024 * 1024 }))).toEqual([])
    })

    it("a probe that failed plans only the passthrough; no video track plans nothing", () => {
        const failed = { fileType: "video/mp4", size: 1024, canEncodeInBrowser: true }
        expect(plan(failed)).toEqual(["original passed through"])
        expect(plan({ ...failed, fileType: "video/quicktime" })).toEqual([])
        expect(plan(facts({ hasVideo: false }))).toEqual([])
    })

    it("aims the bitrate fit at 92% of the cap, less the audio, never below 600 kbps", () => {
        const cap = 80 * 1024 * 1024
        expect(mod.fitBitrate(cap, 300)).toBe(Math.floor((cap * 0.92 * 8) / 300) - 128_000)
        expect(mod.fitBitrate(1024, 300)).toBe(600_000)
    })
})

// With the server converting, the phone only does what is quick and certain;
// the steps that exist for "nothing else could convert this" are the
// server's job instead.
describe("planVideoPrep — serverFallback", () => {
    const plan = (f: Facts) =>
        names(mod.planVideoPrep(f, { maxBytes: MAX, serverFallback: true }))

    it("drops the H.264 remux and both smaller encodes", () => {
        expect(plan(facts())).toEqual(["encoded", "encoded (bitrate fit)"])
    })

    it("drops the HEVC remux", () => {
        const hevc = facts({ videoCodec: "hevc", displayWidth: 2160, displayHeight: 3840, frameRate: 60, bitrate: 40_000_000, size: 60 * 1024 * 1024 })
        expect(plan(hevc)).toEqual(["encoded", "encoded (bitrate fit)"])
    })

    it("drops the passthrough", () => {
        const vp9 = facts({ fileType: "video/webm", extension: "webm", container: "WebM", videoCodec: "vp9", displayWidth: 1920, displayHeight: 1080 })
        expect(plan(vp9)).not.toContain("original passed through")
    })

    it("keeps the fast path and the quick remux", () => {
        expect(
            plan(facts({ fileType: "video/mp4", container: "MP4", displayWidth: 1280, displayHeight: 720, bitrate: 2_000_000 }))
        ).toEqual(["fast path"])
        expect(plan(facts({ displayWidth: 720, displayHeight: 1280, bitrate: 2_000_000 }))[0]).toBe("quick remux")
    })

    it("skips the full encode for a clip over 90 s", () => {
        expect(mod.SERVER_FALLBACK_MAX_ENCODE_SECONDS).toBe(90)
        expect(plan(facts({ duration: 120 }))).toEqual([])
        // A quick remux is still worth trying: it costs no decode.
        expect(plan(facts({ duration: 120, displayWidth: 720, displayHeight: 1280, bitrate: 2_000_000 }))).toEqual(["quick remux"])
        // Off, the same clip is encoded as always.
        expect(names(mod.planVideoPrep(facts({ duration: 120 }), { maxBytes: MAX }))).toContain("encoded")
    })
})

// ── The ladder ────────────────────────────────────────────────

const avc = (width: number, height: number, bitrate: number) => ({
    codec: "avc",
    width,
    height,
    rotation: 0,
    bitrate,
})

const bitrateOf = (init: Init) =>
    (init.video?.quality as { options: { bitrate: number } } | undefined)?.options.bitrate

const tagsOf = (call: unknown[]) => (call[1] as { tags: Record<string, string> }).tags

describe("encodeVideo — the ladder", () => {
    it("takes the fast path untouched", async () => {
        state.video = avc(1280, 720, 2_000_000)
        state.container = "MP4"
        const file = mp4File()
        const progress: number[] = []

        const result = await mod.encodeVideo(file, { maxBytes: MAX, onProgress: (p) => progress.push(p) })

        expect(result).toMatchObject({ blob: file, path: "fast path", codec: "avc", width: 1280, height: 720 })
        expect(state.inits).toHaveLength(0)
        expect(progress).toEqual([1])
        expect(sentry.captureMessage).not.toHaveBeenCalled()
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("copies an in-bounds H.264 .mov into MP4 without encoding it", async () => {
        state.video = avc(720, 1280, 2_000_000)

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX, flow: "post" })

        expect(result).toMatchObject({ path: "quick remux", codec: "avc", wasReencoded: false, width: 720, height: 1280 })
        expect(result.blob.type).toBe("video/mp4")
        expect(state.inits).toHaveLength(1)
        expect(isEncode(state.inits[0])).toBe(false)
        expect(state.inits[0].tracks).toBe("primary")
        expect(state.inits[0].video).toEqual({ allowRotationMetadata: false })
        // Audio packets still copied, not re-encoded.
        expect(await audioOptionsOf(state.inits[0])).toEqual({ codec: "aac" })

        expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
        expect(sentry.captureMessage.mock.calls[0][0]).toBe("video prepared via fallback: quick remux")
        expect(tagsOf(sentry.captureMessage.mock.calls[0])).toMatchObject({
            "video.path": "quick remux",
            "upload.flow": "post",
        })
    })

    it("runs the steps in order and stops at the first success", async () => {
        // The bug report's clip, on a device whose encode fails.
        state.video = avc(1080, 1920, 7_000_000)
        state.failExecute = (init) => (isEncode(init) ? new Error("decoder ran out of memory") : null)

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(result).toMatchObject({ path: "H.264 remux", codec: "avc", width: 1080, height: 1920, wasReencoded: false })
        expect(state.inits).toHaveLength(2)
        expect(widthOf(state.inits[0])).toBe(720)
        expect(isEncode(state.inits[1])).toBe(false)
        // A fallback copy may keep rotation as metadata.
        expect(state.inits[1].video).toEqual({ allowRotationMetadata: true })
        expect(sentry.captureException).not.toHaveBeenCalled()
        expect(tagsOf(sentry.captureMessage.mock.calls[0])["video.path"]).toBe("H.264 remux")
    })

    it("falls to a smaller encode, without the trim, when the normal one fails", async () => {
        state.earliest = -0.02
        state.failExecute = (init) => (widthOf(init) === 1280 ? new Error("encoder error") : null)

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(result).toMatchObject({ path: "encoded (smaller)", width: 960, height: 540, wasReencoded: true })
        expect(state.inits).toHaveLength(2)
        expect(state.inits[0].trim).toEqual({ start: -0.02 })
        expect(state.inits[1].trim).toBeUndefined()
        expect(bitrateOf(state.inits[1])).toBe(1_500_000)
    })

    it("copies HEVC into MP4 as the last resort, and reports it", async () => {
        state.failExecute = (init) => (isEncode(init) ? new Error("nope") : null)

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX, flow: "highlight" })

        expect(result).toMatchObject({ path: "HEVC remux", codec: "hevc", wasReencoded: false })
        expect(state.inits.map(widthOf)).toEqual([1280, 960, 720, undefined])
        expect(tagsOf(sentry.captureMessage.mock.calls[0])).toMatchObject({
            "video.path": "hevc_last_resort",
            "video.codec": "hevc",
            "upload.flow": "highlight",
        })
    })

    it("throws a VideoPrepareError with the facts and every step, reported once", async () => {
        state.failExecute = () => new Error("boom")

        const err = await mod.encodeVideo(movFile(), { maxBytes: MAX, flow: "chat" }).catch((e: unknown) => e)

        expect(err).toBeInstanceOf(mod.VideoPrepareError)
        const failure = err as InstanceType<typeof mod.VideoPrepareError>
        expect(failure.code).toBe("CONVERSION_FAILED")
        expect(failure.message).toBe(
            "This video couldn't be converted on this device. Try a shorter clip, or post it from a computer (VIDEO_CONVERSION_FAILED)"
        )
        expect(failure.facts).toMatchObject({
            fileType: "video/quicktime",
            extension: "mov",
            size: 1024,
            duration: 12.4,
            container: "QuickTime File Format",
            videoCodec: "hevc",
            displayWidth: 1920,
            displayHeight: 1080,
            rotation: 0,
            bitrate: 8_000_000,
            bitrateSource: "packets",
            frameRate: 30,
            hasVideo: true,
            hasAudio: true,
            audioCodec: "aac",
            canEncodeInBrowser: true,
        })
        expect(failure.steps.map((s) => [s.name, s.outcome])).toEqual([
            ["encoded", "failed"],
            ["encoded (bitrate fit)", "skipped"],
            ["encoded (smaller)", "failed"],
            ["encoded (smaller)", "failed"],
            ["HEVC remux", "failed"],
        ])
        expect(failure.steps[0]).toMatchObject({ code: "CONVERSION_FAILED", errorName: "Error", errorMessage: "boom" })

        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureException.mock.calls[0][0]).toBe(failure)
        expect(tagsOf(sentry.captureException.mock.calls[0])).toMatchObject({
            "video.code": "CONVERSION_FAILED",
            "video.codec": "hevc",
            "video.container": "QuickTime File Format",
            "video.path_tried": "encoded > encoded (smaller) > encoded (smaller) > HEVC remux",
            "upload.flow": "chat",
        })
        expect(sentry.captureException.mock.calls[0][1]).toMatchObject({
            extra: { facts: failure.facts, steps: failure.steps },
        })
    })

    it("says TOO_LARGE when everything it made was over the cap, after a bitrate fit", async () => {
        state.outputBytes = () => 4096

        const err = await mod.encodeVideo(movFile(), { maxBytes: 2048 }).catch((e: unknown) => e)

        expect(err).toMatchObject({
            code: "TOO_LARGE",
            message: "This video is too large to post, even after compressing it. Try a shorter clip (VIDEO_TOO_LARGE)",
        })
        const steps = (err as InstanceType<typeof mod.VideoPrepareError>).steps
        expect(steps.find((s) => s.name === "encoded (bitrate fit)")).toMatchObject({
            outcome: "failed",
            code: "TOO_LARGE",
            outputBytes: 4096,
        })
        // The fit asks for less than the encode that was just too big.
        const fit = bitrateOf(state.inits[1])!
        expect(fit).toBeLessThan(2_000_000)
        expect(fit).toBeGreaterThanOrEqual(600_000)
        expect(steps.find((s) => s.name === "HEVC remux")?.code).toBe("TOO_LARGE")
    })

    it("stops the ladder on VideoAudioLostError and never wraps it", async () => {
        state.discardReason = "no_encodable_target_codec"
        state.discardAfterAac = true

        const err = await mod.encodeVideo(movFile(), { maxBytes: MAX }).catch((e: unknown) => e)

        expect(err).toBeInstanceOf(mod.VideoAudioLostError)
        expect(err).not.toBeInstanceOf(mod.VideoPrepareError)
        // The first step's two builds, and nothing after.
        expect(state.inits).toHaveLength(2)
        expect(sentry.captureException).not.toHaveBeenCalled()
        expect(sentry.captureMessage).not.toHaveBeenCalled()
    })

    it("applies allowSilentAudio to whichever step runs", async () => {
        state.discardReason = "no_encodable_target_codec"
        state.discardAfterAac = true
        state.failExecute = (init) => (isEncode(init) ? new Error("nope") : null)

        const result = await mod.encodeVideo(movFile(), { maxBytes: MAX, allowSilentAudio: true })

        expect(result).toMatchObject({ path: "HEVC remux", audioDropped: true })
    })

    it("is cancelled inside a step, silently", async () => {
        const controller = new AbortController()
        state.duringExecute = () => controller.abort()
        state.failExecute = () => (controller.signal.aborted ? new Error("ConversionCanceledError") : null)

        await expect(
            mod.encodeVideo(movFile(), { maxBytes: MAX, signal: controller.signal })
        ).rejects.toThrow(mod.ENCODE_CANCELLED)
        expect(state.inits).toHaveLength(1)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("is cancelled between steps, before the next one builds anything", async () => {
        const controller = new AbortController()
        state.failExecute = (init) => (widthOf(init) === 1280 ? new Error("encoder error") : null)
        let starts = 0

        await expect(
            mod.encodeVideo(movFile(), {
                maxBytes: MAX,
                signal: controller.signal,
                onProgress: (p) => {
                    if (p === 0 && ++starts === 2) controller.abort()
                },
            })
        ).rejects.toThrow(mod.ENCODE_CANCELLED)
        expect(state.inits).toHaveLength(1)
        expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it("restarts the bar for every step that converts, and ends at 1", async () => {
        state.failExecute = (init) => (isEncode(init) ? new Error("nope") : null)
        const progress: number[] = []

        await mod.encodeVideo(movFile(), { maxBytes: MAX, onProgress: (p) => progress.push(p) })

        expect(progress.filter((p) => p === 0)).toHaveLength(4)
        expect(progress[progress.length - 1]).toBe(1)
        expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true)
    })

    it("disposes every Input it opens, whatever happens", async () => {
        state.failExecute = () => new Error("boom")
        await mod.encodeVideo(movFile(), { maxBytes: MAX }).catch(() => {})
        expect(state.inputs.length).toBeGreaterThan(1)
        expect(state.inputs.every((i) => i.disposed)).toBe(true)

        state.inputs = []
        state.failExecute = null
        await mod.encodeVideo(movFile(), { maxBytes: MAX })
        expect(state.inputs.some((i) => i.fromOutput)).toBe(true)
        expect(state.inputs.every((i) => i.disposed)).toBe(true)
    })

    it("reads an unparseable file as PROBE_FAILED, and still passes an mp4 through", async () => {
        state.probeThrows = true

        const err = await mod.encodeVideo(movFile(), { maxBytes: MAX }).catch((e: unknown) => e)
        expect(err).toMatchObject({
            code: "PROBE_FAILED",
            message: "This file couldn't be read as a video. Try a different file (VIDEO_PROBE_FAILED)",
        })
        expect((err as InstanceType<typeof mod.VideoPrepareError>).facts.probeError).toMatch(/unrecognizable/)

        const file = mp4File()
        const result = await mod.encodeVideo(file, { maxBytes: MAX })
        expect(result).toMatchObject({ blob: file, path: "original passed through" })
    })

    it("refuses a file with no video track as NO_VIDEO_TRACK, mp4 or not", async () => {
        state.video = null

        await expect(mod.encodeVideo(mp4File(), { maxBytes: MAX })).rejects.toMatchObject({
            code: "NO_VIDEO_TRACK",
            steps: [],
        })
    })

    it("never sends a URL or the file's name to Sentry", async () => {
        state.failExecute = () => new Error("boom")
        await mod.encodeVideo(movFile(), { maxBytes: MAX }).catch(() => {})
        state.failExecute = (init) => (isEncode(init) ? new Error("nope") : null)
        await mod.encodeVideo(movFile(), { maxBytes: MAX })

        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
        const sent = JSON.stringify([
            ...sentry.captureException.mock.calls.map((c) => c[1]),
            ...sentry.captureMessage.mock.calls,
        ])
        expect(sent).not.toMatch(/https?:\/\/|blob:|X-Amz|\?[A-Za-z-]+=/)
        expect(sent).not.toContain("clip.mov")
    })
})
