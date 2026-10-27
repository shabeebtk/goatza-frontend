// @vitest-environment jsdom

/**
 * useScreenWakeLock — keeps the screen on while an upload runs, and is
 * nothing at all on a browser without Screen Wake Lock. jsdom has none, so a
 * fake one is put on `navigator` where a test needs it.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { holdScreenWakeLock, useScreenWakeLock } from "./useScreenWakeLock"

function Holder({ active }: { active: boolean }) {
  useScreenWakeLock(active)
  return null
}

let visibility: DocumentVisibilityState = "visible"

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event("visibilitychange"))
}

type FakeSentinel = { released: boolean; release: ReturnType<typeof vi.fn> }

function installWakeLock() {
  const sentinels: FakeSentinel[] = []
  const request = vi.fn(async () => {
    const sentinel: FakeSentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true
      }),
    }
    sentinels.push(sentinel)
    return sentinel
  })
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  })
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
  return { request, sentinels }
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, "wakeLock")
  visibility = "visible"
})

describe("useScreenWakeLock", () => {
  it("is a silent no-op without navigator.wakeLock", () => {
    expect("wakeLock" in navigator).toBe(false)

    const { rerender, unmount } = render(<Holder active />)
    rerender(<Holder active={false} />)
    unmount()

    const release = holdScreenWakeLock()
    expect(() => release()).not.toThrow()
  })

  it("asks while active, asks again when the page comes back, lets go when inactive", async () => {
    const { request, sentinels } = installWakeLock()

    const { rerender } = render(<Holder active />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(request).toHaveBeenCalledWith("screen")

    // The browser drops the lock whenever the page is hidden.
    sentinels[0].released = true
    setVisibility("hidden")
    setVisibility("visible")
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))

    rerender(<Holder active={false} />)
    expect(sentinels[1].release).toHaveBeenCalledTimes(1)
  })

  it("asks for nothing while inactive", () => {
    const { request } = installWakeLock()

    render(<Holder active={false} />)

    expect(request).not.toHaveBeenCalled()
  })

  it("holds one lock between overlapping holders, until the last lets go", async () => {
    const { request, sentinels } = installWakeLock()

    const releaseA = holdScreenWakeLock()
    const releaseB = holdScreenWakeLock()
    await waitFor(() => expect(sentinels).toHaveLength(1))
    expect(request).toHaveBeenCalledTimes(1)

    releaseA()
    expect(sentinels[0].release).not.toHaveBeenCalled()

    releaseB()
    expect(sentinels[0].release).toHaveBeenCalledTimes(1)
  })

  it("never throws when the browser refuses", async () => {
    const { request } = installWakeLock()
    request.mockRejectedValueOnce(new Error("NotAllowedError"))

    const release = holdScreenWakeLock()
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    expect(() => release()).not.toThrow()
  })
})
