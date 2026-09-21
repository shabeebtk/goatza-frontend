// @vitest-environment jsdom

/**
 * useFocusedFieldVisible — scrolls the container, and only the container, so
 * the focused field sits inside it after a focus or a viewport resize. jsdom
 * has no layout, so the rects are stubbed per element.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { useRef } from "react"

import { useFocusedFieldVisible } from "./useFocusedFieldVisible"

function Sheet({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusedFieldVisible(ref, enabled)
  return (
    <div>
      <div data-testid="body" ref={ref}>
        <input data-testid="field" />
      </div>
      <input data-testid="outside" />
    </div>
  )
}

const rect = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

let vv: EventTarget
let raf: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vv = new EventTarget()
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true })
  // Run the deferred reveal synchronously.
  raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1 })
})

afterEach(() => {
  cleanup()
  raf.mockRestore()
})

describe("useFocusedFieldVisible", () => {
  it("scrolls the container down when the focused field is below its bottom edge", () => {
    const { getByTestId } = render(<Sheet />)
    const body = getByTestId("body")
    const field = getByTestId("field")
    body.scrollTop = 100
    body.getBoundingClientRect = () => rect(0, 300)
    field.getBoundingClientRect = () => rect(320, 360)

    field.focus()

    // 360 - (300 - 16) = 76 further down.
    expect(body.scrollTop).toBe(176)
  })

  it("scrolls up when the field is above the top edge", () => {
    const { getByTestId } = render(<Sheet />)
    const body = getByTestId("body")
    const field = getByTestId("field")
    body.scrollTop = 100
    body.getBoundingClientRect = () => rect(0, 300)
    field.getBoundingClientRect = () => rect(-20, 20)

    field.focus()

    // (0 + 16) - (-20) = 36 back up.
    expect(body.scrollTop).toBe(64)
  })

  it("re-reveals on a visual viewport resize while the field stays focused", () => {
    const { getByTestId } = render(<Sheet />)
    const body = getByTestId("body")
    const field = getByTestId("field")
    body.scrollTop = 0
    body.getBoundingClientRect = () => rect(0, 600)
    field.getBoundingClientRect = () => rect(400, 440)

    field.focus()
    expect(body.scrollTop).toBe(0) // fits before the keyboard

    // Keyboard up: the sheet is now 300px tall, the field is under the footer.
    body.getBoundingClientRect = () => rect(0, 300)
    vv.dispatchEvent(new Event("resize"))

    expect(body.scrollTop).toBe(440 - (300 - 16))
  })

  it("leaves the container alone for a field outside it, an already visible one, or when disabled", () => {
    const { getByTestId, rerender } = render(<Sheet />)
    const body = getByTestId("body")
    const field = getByTestId("field")
    body.scrollTop = 50
    body.getBoundingClientRect = () => rect(0, 300)
    field.getBoundingClientRect = () => rect(100, 140)

    field.focus()
    expect(body.scrollTop).toBe(50)

    getByTestId("outside").focus()
    vv.dispatchEvent(new Event("resize"))
    expect(body.scrollTop).toBe(50)

    rerender(<Sheet enabled={false} />)
    field.getBoundingClientRect = () => rect(320, 360)
    field.focus()
    expect(body.scrollTop).toBe(50)
  })
})
