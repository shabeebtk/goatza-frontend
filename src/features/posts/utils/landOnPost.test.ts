// @vitest-environment jsdom

/**
 * landOnPost — finds the card by data-post-id and scrolls the window to it;
 * silently does nothing when the card is not on the page.
 *
 * jsdom lays nothing out, so the card's position and the window's scroll
 * offset are stubbed; requestAnimationFrame runs synchronously so the settle
 * loop finishes inside the call. Timers are fake so the landing guard's
 * one-second watch can be ended between tests rather than leaking into the
 * next one.
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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
})

afterEach(() => {
  // Ends any guard still watching (its timer is the last thing pending).
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
})

/** A card whose measured top can be moved between reads. */
function mountCard(id: string, top = CARD_TOP) {
  const el = document.createElement("article")
  el.setAttribute("data-post-id", id)
  const rect = { top }
  el.getBoundingClientRect = () =>
    ({ top: rect.top, left: 0, width: 600, height: 480, bottom: rect.top + 480, right: 600 }) as DOMRect
  return Object.assign(el, { moveTo: (next: number) => { rect.top = next } }) as HTMLElement & {
    moveTo: (top: number) => void
  }
}

function mount<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el)
  return el
}

function offsetOf(el: HTMLElement) {
  return parseFloat(getComputedStyle(el).scrollMarginTop) || 0
}

describe("landOnPost", () => {
  it("scrolls the window to the matching card, without smooth scrolling", () => {
    const el = mount(mountCard("post-1"))
    const offset = offsetOf(el)

    expect(landOnPost("post-1")).toBe(true)

    expect(scrollTo).toHaveBeenCalled()
    const [first] = scrollTo.mock.calls[0]
    expect(first).toEqual({ top: CARD_TOP + SCROLL_Y - offset, behavior: "auto" })
  })

  it("finds the FIRST card when the id appears more than once", () => {
    const first = mount(mountCard("dup"))
    mount(mountCard("dup", 5000))

    landOnPost("dup")

    const [call] = scrollTo.mock.calls[0]
    const offset = offsetOf(first)
    expect(call.top).toBe(CARD_TOP + SCROLL_Y - offset)
  })

  it("is a no-op when the card is not on the page", () => {
    mount(mountCard("post-1"))

    expect(landOnPost("post-2")).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  // The brand-green outline that used to flash on the landed card read as a
  // broken border. Landing is the scroll and the focus, nothing painted.
  it("does not animate an outline on the card", () => {
    const el = mount(mountCard("post-1"))
    const animate = vi.fn()
    el.animate = animate as unknown as HTMLElement["animate"]

    landOnPost("post-1")

    expect(animate).not.toHaveBeenCalled()
    expect(scrollTo).toHaveBeenCalled()
  })

  describe("focus", () => {
    // The tracker in focusReturn.ts remembers the reader's last input across
    // tests; each case states its own.
    const tap = () => document.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    const key = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))

    it("moves focus to the tile of the slide the reader was on", () => {
      const el = mount(mountCard("post-1"))
      const tiles = [0, 1, 2].map((i) => {
        const tile = document.createElement("div")
        tile.setAttribute("role", "button")
        tile.tabIndex = 0
        tile.setAttribute("data-slide", String(i))
        el.appendChild(tile)
        return tile
      })

      landOnPost("post-1", { slide: 2 })

      expect(document.activeElement).toBe(tiles[2])
    })

    it("falls back to the card itself when it has no tile", () => {
      const el = mount(mountCard("post-1"))

      landOnPost("post-1")

      expect(document.activeElement).toBe(el)
    })

    // iOS Safari draws :focus-visible for programmatic focus, so a reader
    // who tapped ✕ (or swiped back) would otherwise see the tile's ring
    // until their next tap. The focus still moves; only the ring is held.
    it("marks the focus quiet after a tap, and clears it on blur", () => {
      const el = mount(mountCard("post-1"))
      tap()

      landOnPost("post-1")

      expect(document.activeElement).toBe(el)
      expect(el.hasAttribute("data-focus-quiet")).toBe(true)

      el.blur()
      expect(el.hasAttribute("data-focus-quiet")).toBe(false)
    })

    it("clears the quiet mark on the next keydown, so the ring comes back", () => {
      const el = mount(mountCard("post-1"))
      tap()

      landOnPost("post-1")
      expect(el.hasAttribute("data-focus-quiet")).toBe(true)

      key()
      expect(el.hasAttribute("data-focus-quiet")).toBe(false)
    })

    it("leaves a keyboard reader's focus ring alone", () => {
      const el = mount(mountCard("post-1"))
      key()

      landOnPost("post-1")

      expect(document.activeElement).toBe(el)
      expect(el.hasAttribute("data-focus-quiet")).toBe(false)
    })
  })

  // iOS Safari puts a history entry's saved scroll position back
  // asynchronously, after the popstate — over a landing that has already
  // happened. The guard catches a scroll the reader did not start.
  describe("guard", () => {
    it("lands again after a programmatic scroll moves the card off its offset", () => {
      const el = mount(mountCard("post-1"))
      const offset = offsetOf(el)
      landOnPost("post-1")
      // Landed: the card sits at its offset.
      el.moveTo(offset)
      const landedCalls = scrollTo.mock.calls.length

      // Something else scrolls the window (the browser restoring an old position).
      el.moveTo(offset + 640)
      window.dispatchEvent(new Event("scroll"))

      expect(scrollTo.mock.calls.length).toBe(landedCalls + 1)
      expect(scrollTo.mock.calls[landedCalls][0]).toEqual({
        top: offset + 640 + SCROLL_Y - offset,
        behavior: "auto",
      })
    })

    it("ignores a scroll that leaves the card where it should be", () => {
      const el = mount(mountCard("post-1"))
      landOnPost("post-1")
      el.moveTo(offsetOf(el))
      const landedCalls = scrollTo.mock.calls.length

      window.dispatchEvent(new Event("scroll"))

      expect(scrollTo.mock.calls.length).toBe(landedCalls)
    })

    it("does not fight a scroll the reader started", () => {
      const el = mount(mountCard("post-1"))
      const offset = offsetOf(el)
      landOnPost("post-1")
      el.moveTo(offset)
      const landedCalls = scrollTo.mock.calls.length

      // A finger on the screen: from here every scroll is the reader's.
      window.dispatchEvent(new Event("touchstart"))
      el.moveTo(offset + 640)
      window.dispatchEvent(new Event("scroll"))

      expect(scrollTo.mock.calls.length).toBe(landedCalls)
    })

    it("gives up after two re-landings", () => {
      const el = mount(mountCard("post-1"))
      const offset = offsetOf(el)
      landOnPost("post-1")
      el.moveTo(offset)
      const landedCalls = scrollTo.mock.calls.length

      // The card can never reach its offset (say, it is the last in the list).
      el.moveTo(offset + 300)
      window.dispatchEvent(new Event("scroll"))
      window.dispatchEvent(new Event("scroll"))
      window.dispatchEvent(new Event("scroll"))

      expect(scrollTo.mock.calls.length).toBe(landedCalls + 2)
    })

    it("stops watching after a second", () => {
      const el = mount(mountCard("post-1"))
      const offset = offsetOf(el)
      landOnPost("post-1")
      el.moveTo(offset)
      const landedCalls = scrollTo.mock.calls.length

      vi.advanceTimersByTime(1000)
      el.moveTo(offset + 640)
      window.dispatchEvent(new Event("scroll"))

      expect(scrollTo.mock.calls.length).toBe(landedCalls)
    })
  })
})
