// @vitest-environment jsdom

/**
 * useBodyScrollLock — the count is the whole point: nested overlays must lock
 * once and release once, whichever of them unmounts first.
 */

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { useBodyScrollLock } from "./useBodyScrollLock"

function Locker({ enabled = true }: { enabled?: boolean }) {
  useBodyScrollLock(enabled)
  return null
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ""
})

describe("useBodyScrollLock", () => {
  it("locks on mount and restores what it found on unmount", () => {
    // Not the empty string: a page that already set overflow must get that
    // value back, not a blank.
    document.body.style.overflow = "scroll"

    const { unmount } = render(<Locker />)
    expect(document.body.style.overflow).toBe("hidden")

    unmount()
    expect(document.body.style.overflow).toBe("scroll")
  })

  it("stays locked until the LAST overlay releases — outer first", () => {
    const outer = render(<Locker />)
    const inner = render(<Locker />)
    expect(document.body.style.overflow).toBe("hidden")

    // The viewer closes while its comments sheet is still up.
    outer.unmount()
    expect(document.body.style.overflow).toBe("hidden")

    inner.unmount()
    expect(document.body.style.overflow).toBe("")
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
    unmount()
    expect(document.body.style.overflow).toBe("")
  })
})
