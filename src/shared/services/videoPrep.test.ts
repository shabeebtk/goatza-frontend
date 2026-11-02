/**
 * Phone or server: prepareVideoForUpload / prepareImageForUpload.
 *
 * The encoder and the compressor are mocked — what is under test is the
 * DECISION: with server processing off this is encodeVideo, errors and all;
 * on, anything the phone cannot do quickly and surely comes back as
 * `{ mode: "source" }`, and only a file over the server's cap still fails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MediaCapabilities } from "./mediaCapabilities"

const MB = 1024 * 1024

const OFF: MediaCapabilities = {
    server_processing: false,
    limits: {
        source_video_bytes: 300 * MB,
        source_image_bytes: 25 * MB,
        max_duration_seconds: { posts: 300, highlights: 90, chat: 90, recruitments: 300 },
    },
}
const ON: MediaCapabilities = { ...OFF, server_processing: true }

const capabilities = vi.hoisted(() => ({ current: null as MediaCapabilities | null }))

vi.mock("./mediaCapabilities", () => ({
    ensureMediaCapabilities: vi.fn(async () => capabilities.current),
}))

vi.mock("./videoEncode", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./videoEncode")>()),
    encodeVideo: vi.fn(),
}))

vi.mock("./imageVariants", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./imageVariants")>()),
    compressImage: vi.fn(),
    makeThumb: vi.fn(),
    getBlobDimensions: vi.fn(),
}))

vi.mock("./uploadTelemetry", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./uploadTelemetry")>()),
    reportVideoFallbackUsed: vi.fn(),
}))

import {
    VideoAudioLostError,
    VideoPrepareError,
    encodeVideo,
    type EncodedVideo,
    type SourceFacts,
} from "./videoEncode"
import {
    ImagePrepareError,
    compressImage,
    getBlobDimensions,
    makeThumb,
} from "./imageVariants"
import { reportVideoFallbackUsed } from "./uploadTelemetry"
import { prepareImageForUpload, prepareVideoForUpload } from "./videoPrep"

const facts = { fileType: "video/mp4", size: 1024, canEncodeInBrowser: true } as SourceFacts

const file = (name: string, type: string, size = 10 * MB) => {
    const f = new File([new Uint8Array(8)], name, { type })
    Object.defineProperty(f, "size", { value: size })
    return f
}

const encoded = { blob: new Blob(["x"], { type: "video/mp4" }), duration: 20, width: 720, height: 1280 } as EncodedVideo

const options = { purpose: "posts" as const, maxBytes: 80 * MB, flow: "post" as const }

beforeEach(() => {
    vi.mocked(encodeVideo).mockReset()
    vi.mocked(reportVideoFallbackUsed).mockReset()
    vi.mocked(compressImage).mockReset()
    vi.mocked(makeThumb).mockReset()
    vi.mocked(getBlobDimensions).mockReset()
    capabilities.current = ON
})

describe("prepareVideoForUpload — server off", () => {
    beforeEach(() => {
        capabilities.current = OFF
    })

    it("is encodeVideo, as today: no serverFallback, the same result", async () => {
        vi.mocked(encodeVideo).mockResolvedValue(encoded)

        const result = await prepareVideoForUpload(file("clip.mov", "video/quicktime"), {
            ...options,
            allowSilentAudio: true,
        })

        expect(result).toEqual({ mode: "ready", encoded })
        const [, passed] = vi.mocked(encodeVideo).mock.calls[0]
        expect(passed).toMatchObject({ maxBytes: 80 * MB, allowSilentAudio: true, flow: "post" })
        expect(passed).not.toHaveProperty("serverFallback")
    })

    it("lets every error through — the sound question included", async () => {
        vi.mocked(encodeVideo).mockRejectedValue(new VideoAudioLostError())

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime"), options)
        ).rejects.toBeInstanceOf(VideoAudioLostError)
    })
})

describe("prepareVideoForUpload — server on", () => {
    it("sends an .mkv to the server without decoding a byte", async () => {
        const result = await prepareVideoForUpload(file("match.mkv", "video/x-matroska"), options)

        expect(result).toEqual({ mode: "source" })
        expect(encodeVideo).not.toHaveBeenCalled()
        expect(vi.mocked(reportVideoFallbackUsed).mock.calls[0][0]).toBe("server")
    })

    it("refuses an .mkv over the server's own cap", async () => {
        await expect(
            prepareVideoForUpload(file("match.mkv", "video/x-matroska", 400 * MB), options)
        ).rejects.toThrow("Video must be under 300 MB.")
        expect(encodeVideo).not.toHaveBeenCalled()
    })

    it("asks the encoder for the quick, certain steps only", async () => {
        vi.mocked(encodeVideo).mockResolvedValue(encoded)

        const result = await prepareVideoForUpload(file("clip.mp4", "video/mp4"), options)

        expect(result).toEqual({ mode: "ready", encoded })
        expect(vi.mocked(encodeVideo).mock.calls[0][1]).toMatchObject({ serverFallback: true })
    })

    it("hands the original over when the phone prefers the server", async () => {
        vi.mocked(encodeVideo).mockRejectedValue(
            new VideoPrepareError("SERVER_PREFERRED", { facts, steps: [] })
        )

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime"), options)
        ).resolves.toEqual({ mode: "source" })
        expect(vi.mocked(reportVideoFallbackUsed).mock.calls[0][0]).toBe("server")
    })

    it("hands the original over when the sound could not be kept — never asks", async () => {
        vi.mocked(encodeVideo).mockRejectedValue(new VideoAudioLostError())

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime"), options)
        ).resolves.toEqual({ mode: "source" })
    })

    it("lets the error through for a file the server would refuse anyway", async () => {
        const failure = new VideoPrepareError("CONVERSION_FAILED", { facts, steps: [] })
        vi.mocked(encodeVideo).mockRejectedValue(failure)

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime", 400 * MB), options)
        ).rejects.toBe(failure)
    })

    it("lets anything that is not a preparation failure through", async () => {
        const boom = new Error("boom")
        vi.mocked(encodeVideo).mockRejectedValue(boom)

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime"), options)
        ).rejects.toBe(boom)
    })

    it("lets a cancel through", async () => {
        const controller = new AbortController()
        controller.abort()
        const cancelled = new VideoAudioLostError()
        vi.mocked(encodeVideo).mockRejectedValue(cancelled)

        await expect(
            prepareVideoForUpload(file("clip.mov", "video/quicktime"), {
                ...options,
                signal: controller.signal,
            })
        ).rejects.toBe(cancelled)
    })
})

describe("prepareImageForUpload", () => {
    const undecodable = () =>
        new ImagePrepareError("IMAGE_DECODE_FAILED", {
            facts: { fileType: "image/heic", size: 1024 } as never,
            steps: [],
        })

    it("is compressImage + makeThumb when the browser can do it", async () => {
        vi.mocked(compressImage).mockResolvedValue(new File(["x"], "a.webp", { type: "image/webp" }))
        vi.mocked(makeThumb).mockResolvedValue(new File(["t"], "a-thumb.webp", { type: "image/webp" }))
        vi.mocked(getBlobDimensions).mockResolvedValue({ width: 2560, height: 1920 })

        const result = await prepareImageForUpload(
            file("IMG_1.HEIC", "", 3 * MB),
            { maxSizeMB: 2.5, fileType: "image/webp" },
            { flow: "post" },
            { thumbMaxDimension: 1080 }
        )

        expect(result).toMatchObject({ mode: "ready", width: 2560, height: 1920 })
        expect(vi.mocked(makeThumb).mock.calls[0][2]).toBe(1080)
    })

    it("hands the original over when the browser cannot open it and the server can", async () => {
        vi.mocked(compressImage).mockRejectedValue(undecodable())

        await expect(
            prepareImageForUpload(file("IMG_1.HEIC", "", 3 * MB), {}, { flow: "post" })
        ).resolves.toEqual({ mode: "source" })
    })

    it("lets the failure through with the server off", async () => {
        capabilities.current = OFF
        const failure = undecodable()
        vi.mocked(compressImage).mockRejectedValue(failure)

        await expect(
            prepareImageForUpload(file("IMG_1.HEIC", "", 3 * MB), {}, { flow: "post" })
        ).rejects.toBe(failure)
    })

    it("lets the failure through for a photo over the server's cap", async () => {
        const failure = undecodable()
        vi.mocked(compressImage).mockRejectedValue(failure)

        await expect(
            prepareImageForUpload(file("huge.heic", "image/heic", 30 * MB), {}, { flow: "post" })
        ).rejects.toBe(failure)
    })
})
