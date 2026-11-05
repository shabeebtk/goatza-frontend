// @vitest-environment jsdom
/**
 * MediaLoading: nothing for a fast load, a spinner for a slow one, a fade out
 * when it is over. Whether a video counts as waiting is useVideoLoading's, below.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useVideoLoading } from "@/shared/hooks/useVideoLoading"
import MediaLoading from "./MediaLoading"

const LISTENED_EVENTS = [
    "waiting",
    "stalled",
    "timeupdate",
    "playing",
    "canplaythrough",
    "pause",
    "ended",
    "error",
    "loadstart",
    "emptied",
]

const spinner = () => document.querySelector("[data-media-loading]")
const leaving = () => document.querySelector("[data-media-loading-leaving]")
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe("MediaLoading", () => {
    it("is hidden before 400 ms and shown after", () => {
        render(<MediaLoading active />)
        expect(spinner()).toBeNull()

        advance(399)
        expect(spinner()).toBeNull()

        advance(1)
        expect(spinner()).toBeTruthy()
    })

    it("a fast load never shows it", () => {
        const view = render(<MediaLoading active />)
        advance(300)

        view.rerender(<MediaLoading active={false} />)
        advance(1000)

        expect(spinner()).toBeNull()
    })

    it("starts counting again each time", () => {
        const view = render(<MediaLoading active />)
        advance(300)
        view.rerender(<MediaLoading active={false} />)
        view.rerender(<MediaLoading active />)

        advance(300)
        expect(spinner()).toBeNull()

        advance(100)
        expect(spinner()).toBeTruthy()
    })

    it("fades out over 150 ms when it stops, then leaves the tree", () => {
        const view = render(<MediaLoading active />)
        advance(400)
        expect(leaving()).toBeNull()

        view.rerender(<MediaLoading active={false} />)
        expect(leaving()).toBeTruthy()

        advance(149)
        expect(spinner()).toBeTruthy()

        advance(1)
        expect(spinner()).toBeNull()
    })

    it("takes no taps and says nothing to a screen reader", () => {
        render(<MediaLoading active size="sm" />)
        advance(400)

        expect(spinner()!.getAttribute("aria-hidden")).toBe("true")
        expect(spinner()!.getAttribute("data-media-loading")).toBe("sm")
        const css = readFileSync(join(__dirname, "MediaLoading.module.css"), "utf8")
        expect(css).toMatch(/\.disc\s*\{[^}]*pointer-events:\s*none/)
    })

    it("reduced motion: a pulse, no spin, in its CSS", () => {
        const css = readFileSync(join(__dirname, "MediaLoading.module.css"), "utf8")
        const reduced = css.slice(css.indexOf("prefers-reduced-motion: reduce"))

        expect(reduced).toMatch(/\.ring\s*\{\s*animation:\s*mediaLoadingPulse/)
        expect(reduced).not.toMatch(/mediaLoadingSpin/)
    })
})

describe("useVideoLoading", () => {
    function Probe({ wanted, hasFrame }: { wanted: boolean; hasFrame: boolean }) {
        const ref = useRef<HTMLVideoElement>(null)
        const loading = useVideoLoading(ref, { wanted, hasFrame })
        return (
            <div data-loading={loading ? "yes" : "no"}>
                <video ref={ref} />
            </div>
        )
    }

    const setup = (wanted = true, hasFrame = true) => {
        const view = render(<Probe wanted={wanted} hasFrame={hasFrame} />)
        return {
            ...view,
            el: document.querySelector("video")!,
        }
    }
    const loading = () => document.querySelector("[data-loading]")!.getAttribute("data-loading") === "yes"
    const clockAt = (el: HTMLVideoElement, seconds: number) =>
        Object.defineProperty(el, "currentTime", { configurable: true, value: seconds })
    const playsOn = (el: HTMLVideoElement) => {
        Object.defineProperty(el, "paused", { configurable: true, value: false })
    }

    it("wanted with no frame yet is loading; not wanted never is", () => {
        const view = setup(true, false)
        expect(loading()).toBe(true)

        view.rerender(<Probe wanted={false} hasFrame={false} />)
        expect(loading()).toBe(false)

        view.rerender(<Probe wanted hasFrame />)
        expect(loading()).toBe(false)
    })

    it("`waiting` after it has played starts buffering, and `playing` ends it", () => {
        const { el } = setup()
        fireEvent.waiting(el)
        expect(loading()).toBe(true)

        fireEvent.playing(el)
        expect(loading()).toBe(false)
    })

    it("a `timeupdate` that did not move the clock does not end it", () => {
        const { el } = setup()
        clockAt(el, 3)
        fireEvent.waiting(el)

        fireEvent.timeUpdate(el)
        expect(loading()).toBe(true)

        clockAt(el, 3.25)
        fireEvent.timeUpdate(el)
        expect(loading()).toBe(false)
    })

    it.each(["canPlayThrough", "pause", "ended", "error"] as const)("`%s` ends it", (event) => {
        const { el } = setup()
        fireEvent.waiting(el)
        expect(loading()).toBe(true)

        fireEvent[event](el)
        expect(loading()).toBe(false)
    })

    it("`stalled` while the clock moves is nothing", () => {
        const { el } = setup()
        playsOn(el)
        clockAt(el, 2)
        fireEvent.stalled(el)

        clockAt(el, 2.2)
        advance(300)

        expect(loading()).toBe(false)
    })

    it("`stalled` while the clock stands still is buffering", () => {
        const { el } = setup()
        playsOn(el)
        clockAt(el, 2)
        fireEvent.stalled(el)

        advance(300)

        expect(loading()).toBe(true)
    })

    it("a clip that failed is not loading, even with no frame, until it has a new source", () => {
        const { el } = setup(true, false)
        expect(loading()).toBe(true)

        fireEvent.error(el)
        expect(loading()).toBe(false)

        fireEvent.loadStart(el)
        expect(loading()).toBe(true)
    })

    it("takes every listener away with it", () => {
        const add = vi.spyOn(HTMLVideoElement.prototype, "addEventListener")
        const remove = vi.spyOn(HTMLVideoElement.prototype, "removeEventListener")
        const { unmount } = setup()
        // The hook's are the last ones: React adds its own as it creates the
        // element, and those stay for the element's life.
        const added = add.mock.calls.slice(-LISTENED_EVENTS.length)
        expect(added.map(([type]) => type).sort()).toEqual([...LISTENED_EVENTS].sort())

        unmount()

        for (const [type, listener] of added) expect(remove).toHaveBeenCalledWith(type, listener)
        add.mockRestore()
        remove.mockRestore()
    })
})
