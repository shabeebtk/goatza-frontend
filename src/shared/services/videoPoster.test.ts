// @vitest-environment jsdom

/**
 * `capturePoster`'s fallbacks. A poster is required by the server, so it must
 * never be the reason a post fails: a <video> element first, then one frame
 * decoded with mediabunny's CanvasSink, then a placeholder.
 *
 * jsdom has no media pipeline and no canvas, so both are stubbed: `load()`
 * fires `loadeddata` or `error` as the test asks, `getContext` hands back a
 * recorder, and `toBlob` writes a blob of the type asked for at a size the
 * test chooses — which is how the byte budget is exercised.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    elementFails: true,
    /** What the frame sink's track and decode do. */
    track: true,
    frame: "ok" as "ok" | "throws" | "none",
    /** Bytes `toBlob` writes, by format and quality. */
    blobBytes: (() => 40_000) as (type: string, quality: number) => number,
    toBlobNull: false,
    fills: [] as Array<{ color: string; width: number; height: number }>,
    sinkOptions: [] as unknown[],
    disposed: 0,
}))

const sentry = vi.hoisted(() => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
}))
vi.mock("@sentry/nextjs", () => sentry)

vi.mock("mediabunny", () => {
    class BlobSource {
        constructor(public blob: Blob) {}
    }
    class Input {
        async getPrimaryVideoTrack() {
            if (!state.track) return null
            return {
                getDisplayWidth: async () => 1920,
                getDisplayHeight: async () => 1080,
                getFirstTimestamp: async () => 0,
                computeDuration: async () => 12,
            }
        }
        dispose() {
            state.disposed++
        }
    }
    class CanvasSink {
        constructor(_track: unknown, options: unknown) {
            state.sinkOptions.push(options)
        }
        async getCanvas(timestamp: number) {
            if (state.frame === "throws") throw new Error("VideoDecoder is not defined")
            if (state.frame === "none") return null
            const canvas = document.createElement("canvas")
            canvas.width = 1280
            canvas.height = 720
            return { canvas, timestamp, duration: 1 / 30 }
        }
    }
    return { ALL_FORMATS: [], BlobSource, Input, CanvasSink }
})

const originals = {
    getContext: HTMLCanvasElement.prototype.getContext,
    toBlob: HTMLCanvasElement.prototype.toBlob,
    load: HTMLMediaElement.prototype.load,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
}

type Encoder = typeof import("./videoEncode")
let mod: Encoder

beforeEach(async () => {
    state.elementFails = true
    state.track = true
    state.frame = "ok"
    state.blobBytes = () => 40_000
    state.toBlobNull = false
    state.fills = []
    state.sinkOptions = []
    state.disposed = 0
    sentry.captureException.mockClear()
    sentry.captureMessage.mockClear()

    URL.createObjectURL = () => "blob:poster-test"
    URL.revokeObjectURL = () => {}

    HTMLMediaElement.prototype.load = function (this: HTMLMediaElement) {
        // Only the load that starts the capture, not the cleanup's.
        if (!this.getAttribute("src")) return
        setTimeout(() => {
            if (state.elementFails) this.onerror?.(new Event("error"))
            else this.onloadeddata?.(new Event("loadeddata"))
        }, 0)
    }
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1280 })
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 720 })

    HTMLCanvasElement.prototype.getContext = function () {
        const ctx = {
            fillStyle: "",
            drawImage: () => {},
            // The placeholder fills its whole canvas, so the rect IS its size.
            fillRect: (_x: number, _y: number, width: number, height: number) => {
                state.fills.push({ color: String(ctx.fillStyle), width, height })
            },
        }
        return ctx
    } as never

    HTMLCanvasElement.prototype.toBlob = function (
        callback: BlobCallback,
        type = "image/png",
        quality = 0.92
    ) {
        setTimeout(() =>
            callback(
                state.toBlobNull
                    ? null
                    : new Blob([new Uint8Array(state.blobBytes(type, quality))], { type })
            )
        )
    }

    vi.resetModules()
    mod = await import("./videoEncode")
})

afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originals.getContext
    HTMLCanvasElement.prototype.toBlob = originals.toBlob
    HTMLMediaElement.prototype.load = originals.load
    URL.createObjectURL = originals.createObjectURL
    URL.revokeObjectURL = originals.revokeObjectURL
})

const clip = () => new Blob([new Uint8Array(1024)], { type: "video/mp4" })

describe("capturePoster", () => {
    it("uses the <video> element when it can, and touches nothing else", async () => {
        state.elementFails = false

        const poster = await mod.capturePoster(clip(), { mode: "feed", flow: "post" })

        expect(poster.type).toBe("image/webp")
        expect(state.sinkOptions).toHaveLength(0)
        expect(sentry.captureMessage).not.toHaveBeenCalled()
    })

    it("decodes a frame with mediabunny when the element fails", async () => {
        const poster = await mod.capturePoster(clip(), { mode: "feed", flow: "post" })

        expect(poster.size).toBeLessThanOrEqual(mod.POSTER_MAX_BYTES)
        // Decoded at ≤1280 on the longest side, not at the source's 1920.
        expect(state.sinkOptions).toEqual([{ width: 1280, height: 720, fit: "contain" }])
        expect(state.disposed).toBe(1)
        expect(state.fills).toHaveLength(0)
        expect(sentry.captureMessage).not.toHaveBeenCalled()
    })

    it("falls back to a placeholder at the video's shape, under the byte budget", async () => {
        state.frame = "throws"
        // Over the budget at the first quality step; the loop steps down.
        state.blobBytes = (_type, quality) => (quality > 0.8 ? 2_000_000 : 30_000)

        const poster = await mod.capturePoster(clip(), { mode: "feed", flow: "post" })

        expect(poster.size).toBeLessThanOrEqual(mod.POSTER_MAX_BYTES)
        expect(poster.type).toBe("image/webp")
        // The track said 1920×1080 before the decode failed.
        expect(state.fills).toEqual([{ color: "#0B0F0C", width: 1280, height: 720 }])
        expect(state.disposed).toBe(1)

        expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
        const [message, context] = sentry.captureMessage.mock.calls[0]
        expect(message).toBe("video prepared via fallback: poster_placeholder")
        expect(context).toMatchObject({
            level: "warning",
            tags: { "video.path": "poster_placeholder", "upload.flow": "post" },
        })
        const steps = (context as { extra: { steps: Array<{ name: string; outcome: string }> } }).extra.steps
        expect(steps.map((s) => [s.name, s.outcome])).toEqual([
            ["poster (video element)", "failed"],
            ["poster (frame sink)", "failed"],
            ["poster (placeholder)", "ok"],
        ])
    })

    it("makes the placeholder 720×1280 when the video's shape is unknown", async () => {
        state.track = false

        await mod.capturePoster(clip(), { mode: "feed" })

        expect(state.fills).toEqual([{ color: "#0B0F0C", width: 720, height: 1280 }])
    })

    it("keeps the caller's size for the placeholder", async () => {
        state.track = false

        await mod.capturePoster(clip(), { mode: "feed", size: { width: 1080, height: 1920 } })

        expect(state.fills).toEqual([{ color: "#0B0F0C", width: 720, height: 1280 }])
    })

    it("rejects with POSTER_FAILED only when even the placeholder cannot be encoded", async () => {
        state.toBlobNull = true

        const err = await mod
            .capturePoster(clip(), { mode: "highlight", flow: "highlight" })
            .catch((e: unknown) => e)

        expect(err).toBeInstanceOf(mod.VideoPrepareError)
        expect(err).toMatchObject({ code: "POSTER_FAILED" })
        expect((err as Error).message).toMatch(/\(VIDEO_POSTER_FAILED\)$/)
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect(sentry.captureException.mock.calls[0][1]).toMatchObject({
            tags: { "video.code": "POSTER_FAILED", "upload.flow": "highlight" },
        })
    })
})
