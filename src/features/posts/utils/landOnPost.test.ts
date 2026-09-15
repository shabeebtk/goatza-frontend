// @vitest-environment jsdom

/**
 * landOnPost — finds the card by data-post-id and scrolls the window to it;
 * silently does nothing when the card is not on the page.
 *
 * jsdom lays nothing out, so the card's position and the window's scroll
 * offset are stubbed; requestAnimationFrame runs synchronously so the settle
 * loop finishes inside the call.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { landOnPost } from "./landOnPost"

const CARD_TOP = 900
const SCROLL_Y = 250

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollTo = vi.fn()
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  Object.defineProperty(window, "scrollY", { value: SCROLL_Y, configurable: true })
  // Synchronous frames: the loop is bounded, so this cannot spin.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(performance.now())
    return 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

function mountCard(id: string) {
  const el = document.createElement("article")
  el.setAttribute("data-post-id", id)
  el.getBoundingClientRect = () =>
    ({ top: CARD_TOP, left: 0, width: 600, height: 480, bottom: CARD_TOP + 480, right: 600 }) as DOMRect
  document.body.appendChild(el)
  return el
}

describe("landOnPost", () => {
  it("scrolls the window to the matching card, without smooth scrolling", () => {
    const el = mountCard("post-1")
    const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0

    expect(landOnPost("post-1")).toBe(true)

    expect(scrollTo).toHaveBeenCalled()
    const [first] = scrollTo.mock.calls[0]
    expect(first).toEqual({ top: CARD_TOP + SCROLL_Y - offset, behavior: "auto" })
  })

  it("finds the FIRST card when the id appears more than once", () => {
    const first = mountCard("dup")
    const second = mountCard("dup")
    second.getBoundingClientRect = () =>
      ({ top: 5000, left: 0, width: 600, height: 480, bottom: 5480, right: 600 }) as DOMRect

    landOnPost("dup")

    const [call] = scrollTo.mock.calls[0]
    const offset = parseFloat(getComputedStyle(first).scrollMarginTop) || 0
    expect(call.top).toBe(CARD_TOP + SCROLL_Y - offset)
  })

  it("is a no-op when the card is not on the page", () => {
    mountCard("post-1")

    expect(landOnPost("post-2")).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  // jsdom has no Element.animate; the highlight must degrade to nothing
  // rather than throw after the scroll already happened.
  it("tolerates a highlight request where animations are unavailable", () => {
    mountCard("post-1")

    expect(() => landOnPost("post-1", { highlight: true })).not.toThrow()
    expect(scrollTo).toHaveBeenCalled()
  })
})
