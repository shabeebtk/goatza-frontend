// @vitest-environment jsdom
/**
 * revealChrome: an overlay that has just closed brings the bars back, and the
 * hook's own progress with them, so the next scroll tick does not undo it.
 */

import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { revealChrome, useScrollChrome } from "./useScrollChrome"

function Nav() {
    useScrollChrome()
    return null
}

const root = document.documentElement
const progress = () => root.style.getPropertyValue("--chrome-progress")

let scrollY = 0
function scrollTo(y: number) {
    scrollY = y
    act(() => {
        window.dispatchEvent(new Event("scroll"))
        vi.advanceTimersByTime(20)
    })
}

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
    })
    scrollY = 0
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY })
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    root.removeAttribute("data-chrome-snap")
})

describe("revealChrome", () => {
    it("resets --chrome-progress to 0, with the settle transition on", () => {
        render(<Nav />)
        scrollTo(500)
        scrollTo(1000)
        expect(Number(progress())).toBe(1)

        act(() => revealChrome())

        expect(progress()).toBe("0")
        expect(root.hasAttribute("data-chrome-snap")).toBe(true)
    })

    it("resets the hook's own progress, not just the variable", () => {
        render(<Nav />)
        scrollTo(500)
        scrollTo(1000)
        act(() => revealChrome())
        act(() => {
            vi.advanceTimersByTime(600)
        })

        // Had it kept its old progress of 1, a small move would read as hidden.
        scrollTo(1008)

        expect(Number(progress())).toBeLessThan(0.5)
    })

    it("ignores the scroll a keyboard going away causes", () => {
        render(<Nav />)
        scrollTo(500)
        act(() => revealChrome())

        scrollTo(900)

        expect(progress()).toBe("0")
    })

    it("does nothing with no bars mounted", () => {
        expect(() => revealChrome()).not.toThrow()
        expect(progress()).toBe("")
    })

    it("stops listening when the nav goes", () => {
        const { unmount } = render(<Nav />)
        unmount()

        revealChrome()

        expect(progress()).toBe("")
    })
})
