// @vitest-environment jsdom
/**
 * grabVideoFrame: a frame that is really there and not a black one, or null in
 * bounded time, and never a leaked element.
 *
 * jsdom has no media pipeline and no canvas. `load()` fires what the test asks,
 * setting `currentTime` fires `seeked`, and the 32×32 sample canvas hands back
 * the brightness the test chose for that seek.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { frameCandidateTimes, grabVideoFrame } from "./videoFrame"

const originals = {
    getContext: HTMLCanvasElement.prototype.getContext,
    load: HTMLMediaElement.prototype.load,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
}

type Stub = {
    /** "ok" fires loadeddata on load; "error" fires error; "silent" fires nothing. */
    load: "ok" | "error" | "silent"
    duration: number
    /** Sample brightness for the frame at each seek, by seek order. */
    brightness: number[]
    seeks: number[]
    /** How many seeks get a `seeked`. Past that, the element never answers. */
    answerSeeks: number
    video: HTMLVideoElement | null
    revoked: string[]
    /** How many times load() ran with no src left: the cleanup's. */
    emptyLoads: number
}

let stub: Stub

const clip = () => new Blob([new Uint8Array(16)], { type: "video/mp4" })

/** A frame of one brightness: `level` on every channel, except one pixel at `peak`. */
function pixels(level: number, peak = level) {
    const data = new Uint8ClampedArray(32 * 32 * 4).fill(level)
    data.set([peak, peak, peak], 0)
    return { data }
}

beforeEach(() => {
    stub = {
        load: "ok",
        duration: 20,
        brightness: [120],
        seeks: [],
        answerSeeks: Infinity,
        video: null,
        revoked: [],
        emptyLoads: 0,
    }
    URL.createObjectURL = () => "blob:grab"
    URL.revokeObjectURL = (url: string) => {
        stub.revoked.push(url)
    }

    HTMLMediaElement.prototype.load = function (this: HTMLMediaElement) {
        if (!this.getAttribute("src")) {
            stub.emptyLoads++
            return
        }
        stub.video = this as HTMLVideoElement
        Object.defineProperty(this, "duration", { configurable: true, value: stub.duration })
        Object.defineProperty(this, "currentTime", {
            configurable: true,
            get: () => stub.seeks[stub.seeks.length - 1] ?? 0,
            set: (time: number) => {
                stub.seeks.push(time)
                if (stub.seeks.length > stub.answerSeeks) return
                setTimeout(() => this.onseeked?.(new Event("seeked")), 0)
            },
        })
        setTimeout(() => {
            if (stub.load === "ok") this.onloadeddata?.(new Event("loadeddata"))
            if (stub.load === "error") this.onerror?.(new Event("error"))
        }, 0)
    }
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1920 })
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1080 })

    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
        return {
            drawImage: () => {},
            // Only the 32×32 sample is read; its brightness is that seek's.
            getImageData: () => {
                const seek = Math.max(0, stub.seeks.length - 1)
                const level = stub.brightness[Math.min(seek, stub.brightness.length - 1)]
                return pixels(level)
            },
        }
    } as never

    vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    })
})

afterEach(() => {
    vi.useRealTimers()
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).requestVideoFrameCallback
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).cancelVideoFrameCallback
    HTMLCanvasElement.prototype.getContext = originals.getContext
    HTMLMediaElement.prototype.load = originals.load
    URL.createObjectURL = originals.createObjectURL
    URL.revokeObjectURL = originals.revokeObjectURL
})

/** Past every timer the grab can be waiting on. */
const settle = () => vi.advanceTimersByTimeAsync(10_000)

const grab = async (options: Partial<Parameters<typeof grabVideoFrame>[1]> = {}) => {
    const pending = grabVideoFrame(clip(), { timeoutMs: 8000, ...options })
    await settle()
    return pending
}

describe("frameCandidateTimes", () => {
    /** Fractions of a duration are not exact in floating point. */
    const times = (duration: number) => frameCandidateTimes(duration).map((time) => Number(time.toFixed(3)))

    it("ascending, inside the clip, at most 4, reaching as far as it can", () => {
        expect(times(60)).toEqual([0.1, 0.5, 1, 15])
        expect(times(20)).toEqual([0.1, 0.5, 1, 5])
        expect(times(6)).toEqual([0.1, 0.5, 1, 1.5])
    })

    it("does not try one moment twice", () => {
        expect(times(10)).toEqual([0.1, 0.5, 1, 2.5])
    })

    it("a short clip keeps to what is inside it", () => {
        expect(times(0.8)).toEqual([0.08, 0.2, 0.5])
        expect(times(0.02)).toEqual([0.002])
    })

    it("no usable duration: only the absolute moments", () => {
        expect(frameCandidateTimes(NaN)).toEqual([0.1, 0.5, 1])
        expect(frameCandidateTimes(Infinity)).toEqual([0.1, 0.5, 1])
        expect(frameCandidateTimes(0)).toEqual([0.1, 0.5, 1])
    })
})

describe("grabVideoFrame", () => {
    it("takes the first frame that is not black", async () => {
        stub.brightness = [120]

        const frame = await grab()

        expect(stub.seeks).toEqual([0.1])
        expect(frame).toMatchObject({ width: 1920, height: 1080, time: 0.1 })
    })

    it("skips black candidates", async () => {
        stub.brightness = [0, 3, 90]

        const frame = await grab()

        expect(stub.seeks).toEqual([0.1, 0.5, 1])
        expect(frame?.time).toBe(1)
    })

    it("dim but with something bright in it is not black", async () => {
        HTMLCanvasElement.prototype.getContext = function () {
            return { drawImage: () => {}, getImageData: () => pixels(10, 200) }
        } as never

        const frame = await grab()

        expect(stub.seeks).toEqual([0.1])
        expect(frame?.time).toBe(0.1)
    })

    it("all black: the brightest one seen", async () => {
        stub.brightness = [1, 9, 4, 2]

        const frame = await grab()

        expect(stub.seeks).toEqual([0.1, 0.5, 1, 5])
        expect(frame?.time).toBe(0.5)
    })

    it("a frame it cannot read is taken as it is", async () => {
        HTMLCanvasElement.prototype.getContext = function () {
            return { drawImage: () => {} }
        } as never

        const frame = await grab()

        expect(frame?.time).toBe(0.1)
    })

    it("scales to maxSide, and never up", async () => {
        expect(await grab({ maxSide: 1280 })).toMatchObject({ width: 1280, height: 720 })
        expect(await grab({ maxSide: 4000 })).toMatchObject({ width: 1920, height: 1080 })
    })

    it("no duration: what is decoded first, with no seek to hang on", async () => {
        stub.duration = NaN
        stub.answerSeeks = 0

        const frame = await grab()

        expect(stub.seeks).toEqual([])
        expect(frame?.time).toBe(0)
    })

    it("waits for requestVideoFrameCallback when there is one", async () => {
        const callbacks: Array<() => void> = []
        Object.assign(HTMLVideoElement.prototype, {
            requestVideoFrameCallback: (callback: () => void) => callbacks.push(callback),
            cancelVideoFrameCallback: vi.fn(),
        })

        let done = false
        const pending = grabVideoFrame(clip(), { timeoutMs: 8000 }).then((frame) => {
            done = true
            return frame
        })
        await vi.advanceTimersByTimeAsync(5)
        expect(callbacks).toHaveLength(1)
        expect(done).toBe(false)

        callbacks[0]()
        await vi.advanceTimersByTimeAsync(0)

        expect(done).toBe(true)
        expect((await pending)?.time).toBe(0.1)
    })

    it("falls back after 300 ms when the frame callback never fires", async () => {
        const cancel = vi.fn()
        Object.assign(HTMLVideoElement.prototype, {
            requestVideoFrameCallback: () => 7,
            cancelVideoFrameCallback: cancel,
        })

        let done = false
        void grabVideoFrame(clip(), { timeoutMs: 8000 }).then(() => {
            done = true
        })
        await vi.advanceTimersByTimeAsync(250)
        expect(done).toBe(false)

        await vi.advanceTimersByTimeAsync(100)
        expect(done).toBe(true)
        expect(cancel).toHaveBeenCalledWith(7)
    })

    it("timeout with nothing: null, cleaned up", async () => {
        stub.load = "silent"

        const frame = await grab({ timeoutMs: 6000 })

        expect(frame).toBeNull()
        expect(stub.revoked).toEqual(["blob:grab"])
        expect(stub.video!.hasAttribute("src")).toBe(false)
        expect(stub.emptyLoads).toBe(1)
    })

    it("a seek that never answers: settles at the timeout", async () => {
        stub.answerSeeks = 0

        const frame = await grab({ timeoutMs: 6000 })

        expect(frame).toBeNull()
        expect(stub.revoked).toEqual(["blob:grab"])
    })

    it("a timeout after a dark frame: that frame, rather than nothing", async () => {
        stub.brightness = [5]
        stub.answerSeeks = 1

        const frame = await grab({ timeoutMs: 6000 })

        expect(stub.seeks).toEqual([0.1, 0.5])
        expect(frame?.time).toBe(0.1)
    })

    it("an error: null, cleaned up", async () => {
        stub.load = "error"

        const frame = await grab()

        expect(frame).toBeNull()
        expect(stub.revoked).toEqual(["blob:grab"])
        expect(stub.emptyLoads).toBe(1)
    })

    it("aborted: null at once, cleaned up", async () => {
        stub.load = "silent"
        const controller = new AbortController()
        const pending = grabVideoFrame(clip(), { timeoutMs: 8000, signal: controller.signal })

        controller.abort()

        expect(await pending).toBeNull()
        expect(stub.revoked).toEqual(["blob:grab"])
        expect(stub.emptyLoads).toBe(1)
    })

    it("already aborted: never starts", async () => {
        const controller = new AbortController()
        controller.abort()

        expect(await grabVideoFrame(clip(), { timeoutMs: 8000, signal: controller.signal })).toBeNull()
        expect(stub.video).toBeNull()
    })

    it("cleans up after a good frame too", async () => {
        await grab()

        expect(stub.revoked).toEqual(["blob:grab"])
        expect(stub.video!.hasAttribute("src")).toBe(false)
    })

    it("muted, inline, and asking for the data", async () => {
        await grab()

        expect(stub.video!.muted).toBe(true)
        expect(stub.video!.playsInline).toBe(true)
        expect(stub.video!.preload).toBe("auto")
    })
})
