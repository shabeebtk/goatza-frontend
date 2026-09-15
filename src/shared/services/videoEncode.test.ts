// @vitest-environment jsdom

/**
 * The audio contract of `encodeVideo`, against a fake mediabunny.
 *
 * The fake mirrors the ONE rule of `Conversion._processAudioTrack` that
 * matters here: audio packets are copied only when the options carry no
 * `quality`/`bitrate`, the codec matches the source, and no track starts
 * before the conversion does. Everything else — which tracks get discarded,
 * whether the AAC extension is available, whether the output bytes carry an
 * audio track — is a knob on `state`, so each test describes one browser.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

type DiscardReason =
    | "no_encodable_target_codec"
    | "undecodable_source_codec"
    | null

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
    /** Everything `Conversion.init` was called with, in order. */
    inits: [] as Array<Record<string, unknown>>,
    /** Every `Input` built from the OUTPUT buffer (the post-encode check). */
    outputChecks: 0,
    executed: 0,
    aacRegistered: false,
    lastOutputHadAudio: false,
}))

vi.mock("@mediabunny/aac-encoder", () => ({
    registerAacEncoder: vi.fn(() => {
        state.aacRegistered = true
    }),
}))

vi.mock("mediabunny", () => {
    class FakeVideoTrack {
        type = "video" as const
        displayWidth = 1920
        displayHeight = 1080
        async getCodec() {
            return "hevc"
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
        constructor(public options: unknown) {}
    }
    class EncodedAudioPacketSource {}
    class AudioSampleSource {}

    class Output {
        tracks: Array<{ type: "video" | "audio"; source: unknown }> = []
        target: BufferTarget
        constructor(options: { target: BufferTarget }) {
            this.target = options.target
        }
    }

    class Input {
        private readonly fromOutput: boolean
        constructor(options: { source: unknown }) {
            this.fromOutput = options.source instanceof BufferSource
            if (this.fromOutput) state.outputChecks++
        }
        async getPrimaryVideoTrack() {
            return new FakeVideoTrack()
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
        dispose() {}
    }

    type AudioOptions = { codec?: string; quality?: unknown }

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
            readonly trim: { start?: number } | undefined
        ) {}

        static async init(options: {
            output: Output
            trim?: { start?: number }
            audio: (track: FakeAudioTrack, n: number) => Promise<AudioOptions>
        }) {
            state.inits.push(options)
            const conversion = new Conversion(options.output, options.trim)

            options.output.tracks.push({ type: "video", source: {} })

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
            this.output.target.buffer = new ArrayBuffer(4096)
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
    state.inits = []
    state.outputChecks = 0
    state.executed = 0
    state.aacRegistered = false
    state.lastOutputHadAudio = false

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
})

const audioOptionsOf = async (init: Record<string, unknown>) => {
    const audio = init.audio as (
        track: unknown,
        n: number
    ) => Promise<{ codec?: string; quality?: unknown }>
    return audio({ getCodec: async () => state.sourceAudioCodec }, 1)
}

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

    it("keeps the unsupported message for a file that cannot be made playable", async () => {
        const mb = await import("mediabunny")
        vi.mocked(mb.canEncodeVideo).mockResolvedValueOnce(false)

        await expect(
            mod.encodeVideo(movFile(), { maxBytes: MAX })
        ).rejects.toThrow(mod.VIDEO_UNSUPPORTED_MESSAGE)
    })

    it("isVideoAudioLostError matches the error and nothing else", () => {
        expect(mod.isVideoAudioLostError(new mod.VideoAudioLostError())).toBe(true)
        expect(
            mod.isVideoAudioLostError(new Error(mod.VIDEO_UNSUPPORTED_MESSAGE))
        ).toBe(false)
        expect(mod.isVideoAudioLostError("nope")).toBe(false)
    })
})
