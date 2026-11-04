// @vitest-environment jsdom
/**
 * settleViewport: blur the field, wait for the keyboard, and scroll to where the
 * page already is, which is what makes iOS put fixed elements back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reanchorFixedElements, settleViewport } from "./settleViewport"

function stubViewport(height: number) {
    const listeners = new Set<() => void>()
    const viewport = {
        height,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        resizeTo(next: number) {
            this.height = next
            listeners.forEach((cb) => cb())
        },
        listeners,
    }
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport })
    return viewport
}

beforeEach(() => {
    window.scrollTo = vi.fn()
})

afterEach(() => {
    delete (window as unknown as { visualViewport?: unknown }).visualViewport
    vi.useRealTimers()
    document.body.innerHTML = ""
})

describe("settleViewport", () => {
    it("blurs the focused field straight away, before anything closes", () => {
        stubViewport(window.innerHeight)
        const input = document.body.appendChild(document.createElement("input"))
        input.focus()
        expect(document.activeElement).toBe(input)

        void settleViewport()

        expect(document.activeElement).not.toBe(input)
    })

    it("no keyboard up: nudges the scroll at once, on the spot", async () => {
        stubViewport(window.innerHeight)
        window.scrollX = 0
        Object.defineProperty(window, "scrollY", { configurable: true, value: 1234 })

        await settleViewport()

        expect(window.scrollTo).toHaveBeenCalledWith(0, 1234)
    })

    it("keyboard up: waits for the viewport to grow back, then nudges", async () => {
        const viewport = stubViewport(300)

        const done = settleViewport()
        expect(window.scrollTo).not.toHaveBeenCalled()

        viewport.resizeTo(window.innerHeight)
        await done

        expect(window.scrollTo).toHaveBeenCalledTimes(1)
        expect(viewport.listeners.size).toBe(0)
    })

    it("a resize part of the way there does not count", () => {
        const viewport = stubViewport(300)

        void settleViewport()
        viewport.resizeTo(500)

        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it("gives up after 400 ms", async () => {
        vi.useFakeTimers()
        const viewport = stubViewport(300)

        const done = settleViewport()
        vi.advanceTimersByTime(399)
        expect(window.scrollTo).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        await done

        expect(window.scrollTo).toHaveBeenCalledTimes(1)
        expect(viewport.listeners.size).toBe(0)
    })

    it("with no visualViewport it still blurs, and does nothing else", async () => {
        const input = document.body.appendChild(document.createElement("input"))
        input.focus()

        await settleViewport()

        expect(document.activeElement).not.toBe(input)
        expect(window.scrollTo).not.toHaveBeenCalled()
    })
})

describe("reanchorFixedElements", () => {
    it("scrolls to where the page already is", () => {
        stubViewport(window.innerHeight)
        Object.defineProperty(window, "scrollY", { configurable: true, value: 50 })

        reanchorFixedElements()

        expect(window.scrollTo).toHaveBeenCalledWith(window.scrollX, 50)
    })
})
