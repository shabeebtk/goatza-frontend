// @vitest-environment jsdom

/**
 * useBodyScrollLock — the count is the whole point: nested overlays must lock
 * once and release once, whichever of them unmounts first. The rest is what
 * iOS needs on top of `overflow: hidden`: the touchmove guard, the <html>
 * flag, and a scroll position that is never touched.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { useBodyScrollLock } from "./useBodyScrollLock"

function Locker({ enabled = true }: { enabled?: boolean }) {
  useBodyScrollLock(enabled)
  return null
}

const root = () => document.documentElement

afterEach(() => {
  cleanup()
  document.body.style.overflow = ""
  document.body.style.paddingRight = ""
  root().style.overflow = ""
  root().style.overscrollBehavior = ""
  root().removeAttribute("data-scroll-locked")
  document.body.innerHTML = ""
})

/** A touchmove the way a browser sends it: cancelable, with one finger. */
function touchMove(target: Element, opts: { fingers?: number; x?: number; y?: number } = {}) {
  const fingers = opts.fingers ?? 1
  const touches = Array.from({ length: fingers }, () => ({
    clientX: opts.x ?? 10,
    clientY: opts.y ?? 100,
  }))
  const event = new Event("touchmove", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", { value: touches })
  target.dispatchEvent(event)
  return event
}

function touchStart(target: Element, x = 10, y = 10) {
  const event = new Event("touchstart", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", { value: [{ clientX: x, clientY: y }] })
  target.dispatchEvent(event)
}

/** jsdom has no layout: fake a scroll container that has room to scroll. */
function makeScrollable(el: HTMLElement, opts: { vertical?: boolean } = {}) {
  const vertical = opts.vertical ?? true
  el.style.overflowY = vertical ? "auto" : "hidden"
  el.style.overflowX = vertical ? "hidden" : "auto"
  Object.defineProperty(el, "scrollHeight", { value: vertical ? 1000 : 100, configurable: true })
  Object.defineProperty(el, "clientHeight", { value: 100, configurable: true })
  Object.defineProperty(el, "scrollWidth", { value: vertical ? 100 : 1000, configurable: true })
  Object.defineProperty(el, "clientWidth", { value: 100, configurable: true })
}

describe("useBodyScrollLock", () => {
  it("locks html and body on mount and restores what it found on unmount", () => {
    // Not the empty string: a page that already set overflow must get that
    // value back, not a blank.
    document.body.style.overflow = "scroll"
    root().style.overflow = "clip"

    const { unmount } = render(<Locker />)
    expect(document.body.style.overflow).toBe("hidden")
    expect(root().style.overflow).toBe("hidden")
    expect(root().style.overscrollBehavior).toBe("none")
    expect(root().hasAttribute("data-scroll-locked")).toBe(true)

    unmount()
    expect(document.body.style.overflow).toBe("scroll")
    expect(root().style.overflow).toBe("clip")
    expect(root().style.overscrollBehavior).toBe("")
    expect(root().hasAttribute("data-scroll-locked")).toBe(false)
  })

  it("stays locked until the LAST overlay releases — outer first", () => {
    const outer = render(<Locker />)
    const inner = render(<Locker />)
    expect(document.body.style.overflow).toBe("hidden")

    // The viewer closes while its comments sheet is still up.
    outer.unmount()
    expect(document.body.style.overflow).toBe("hidden")
    expect(root().hasAttribute("data-scroll-locked")).toBe(true)

    inner.unmount()
    expect(document.body.style.overflow).toBe("")
    expect(root().style.overflow).toBe("")
    expect(root().hasAttribute("data-scroll-locked")).toBe(false)
  })

  it("stays locked until the LAST overlay releases — inner first", () => {
    const outer = render(<Locker />)
    const inner = render(<Locker />)

    inner.unmount()
    expect(document.body.style.overflow).toBe("hidden")

    outer.unmount()
    expect(document.body.style.overflow).toBe("")
  })

  it("does nothing while disabled", () => {
    const { unmount } = render(<Locker enabled={false} />)
    expect(document.body.style.overflow).toBe("")
    expect(root().hasAttribute("data-scroll-locked")).toBe(false)
    unmount()
    expect(document.body.style.overflow).toBe("")
  })

  it("leaves the scroll position exactly where it was", () => {
    Object.defineProperty(window, "scrollY", { value: 1234, configurable: true, writable: true })
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})

    const { unmount } = render(<Locker />)
    expect(window.scrollY).toBe(1234)
    unmount()
    expect(window.scrollY).toBe(1234)
    expect(scrollTo).not.toHaveBeenCalled()

    scrollTo.mockRestore()
  })

  describe("touchmove while locked", () => {
    it("blocks a touch on the page behind the overlay", () => {
      const page = document.createElement("div")
      document.body.appendChild(page)

      render(<Locker />)
      const event = touchMove(page)
      expect(event.defaultPrevented).toBe(true)
    })

    it("does nothing once unlocked", () => {
      const page = document.createElement("div")
      document.body.appendChild(page)

      const { unmount } = render(<Locker />)
      unmount()
      expect(touchMove(page).defaultPrevented).toBe(false)
    })

    it("blocks a touch inside an overlay that has nothing to scroll", () => {
      const overlay = document.createElement("div")
      overlay.setAttribute("aria-modal", "true")
      const header = document.createElement("div")
      overlay.appendChild(header)
      document.body.appendChild(overlay)

      render(<Locker />)
      expect(touchMove(header).defaultPrevented).toBe(true)
    })

    it("allows a touch inside a scroll container within the overlay", () => {
      const overlay = document.createElement("div")
      overlay.setAttribute("aria-modal", "true")
      const list = document.createElement("div")
      makeScrollable(list)
      const row = document.createElement("button")
      list.appendChild(row)
      overlay.appendChild(list)
      document.body.appendChild(overlay)

      render(<Locker />)
      touchStart(row, 10, 10)
      // A vertical drag over a vertical scroller.
      expect(touchMove(row, { x: 12, y: 80 }).defaultPrevented).toBe(false)
    })

    it("judges the gesture on its own axis", () => {
      const overlay = document.createElement("div")
      overlay.setAttribute("data-scroll-lock-root", "")
      const track = document.createElement("div")
      makeScrollable(track, { vertical: false })
      const slide = document.createElement("div")
      track.appendChild(slide)
      overlay.appendChild(track)
      document.body.appendChild(overlay)

      render(<Locker />)
      touchStart(slide, 100, 100)
      // Horizontal drag over a horizontal scroller: the carousel's.
      expect(touchMove(slide, { x: 20, y: 102 }).defaultPrevented).toBe(false)
      // Vertical drag over the same, which cannot scroll that way: blocked.
      touchStart(slide, 100, 100)
      expect(touchMove(slide, { x: 102, y: 20 }).defaultPrevented).toBe(true)
    })

    it("always lets two fingers, range inputs and data-allow-touchmove through", () => {
      const page = document.createElement("div")
      const range = document.createElement("input")
      range.type = "range"
      const cropper = document.createElement("div")
      cropper.setAttribute("data-allow-touchmove", "")
      const handle = document.createElement("span")
      cropper.appendChild(handle)
      document.body.append(page, range, cropper)

      render(<Locker />)
      expect(touchMove(page, { fingers: 2 }).defaultPrevented).toBe(false)
      expect(touchMove(range).defaultPrevented).toBe(false)
      expect(touchMove(handle).defaultPrevented).toBe(false)
    })
  })
})
