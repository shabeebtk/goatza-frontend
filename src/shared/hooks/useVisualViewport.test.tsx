// @vitest-environment jsdom

/**
 * useVisualViewport — writes the visible area to <html> and takes it away
 * again. jsdom has no visualViewport, so one is stubbed on `window`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { useVisualViewport } from "./useVisualViewport"

function Tracker({ enabled = true }: { enabled?: boolean }) {
  useVisualViewport(enabled)
  return null
}

type Listener = () => void

class FakeVisualViewport extends EventTarget {
  offsetTop = 0
  height = 800
}

let vv: FakeVisualViewport

beforeEach(() => {
  vv = new FakeVisualViewport()
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true })
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  for (const name of ["--vv-top", "--vv-height", "--keyboard-inset"]) {
    document.documentElement.style.removeProperty(name)
  }
})

const read = (name: string) => document.documentElement.style.getPropertyValue(name)

describe("useVisualViewport", () => {
  it("writes the variables on mount and follows the viewport", () => {
    render(<Tracker />)
    expect(read("--vv-top")).toBe("0px")
    expect(read("--vv-height")).toBe("800px")
    expect(read("--keyboard-inset")).toBe("0px")

    // The keyboard comes up: the visible area shrinks and shifts.
    vv.height = 450
    vv.offsetTop = 30
    vv.dispatchEvent(new Event("resize"))

    expect(read("--vv-top")).toBe("30px")
    expect(read("--vv-height")).toBe("450px")
    expect(read("--keyboard-inset")).toBe("320px")

    // iOS pans the visible area while the keyboard is open.
    vv.offsetTop = 60
    vv.dispatchEvent(new Event("scroll"))
    expect(read("--vv-top")).toBe("60px")
  })

  it("removes the variables on cleanup", () => {
    const { unmount } = render(<Tracker />)
    expect(read("--vv-height")).toBe("800px")

    unmount()
    expect(read("--vv-top")).toBe("")
    expect(read("--vv-height")).toBe("")
    expect(read("--keyboard-inset")).toBe("")

    // And stops listening.
    vv.height = 300
    vv.dispatchEvent(new Event("resize"))
    expect(read("--vv-height")).toBe("")
  })

  it("keeps the variables until the last user is gone", () => {
    const outer = render(<Tracker />)
    const inner = render(<Tracker />)

    outer.unmount()
    expect(read("--vv-height")).toBe("800px")

    inner.unmount()
    expect(read("--vv-height")).toBe("")
  })

  it("does nothing while disabled", () => {
    const { unmount } = render(<Tracker enabled={false} />)
    expect(read("--vv-height")).toBe("")
    unmount()
  })

  it("falls back to the window when there is no visualViewport", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true })
    const listeners: Listener[] = []
    const add = window.addEventListener.bind(window)
    window.addEventListener = ((type: string, fn: Listener) => {
      if (type === "resize") listeners.push(fn)
      add(type, fn)
    }) as typeof window.addEventListener

    render(<Tracker />)
    expect(read("--vv-height")).toBe("800px")
    expect(read("--keyboard-inset")).toBe("0px")
    expect(listeners.length).toBeGreaterThan(0)

    window.addEventListener = add
  })
})
