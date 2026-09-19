// @vitest-environment jsdom

/**
 * The inline script that sets `data-theme` before first paint.
 *
 * It runs in <head> with no React and no module scope, so the test does what
 * the browser does: takes the text out of the rendered <script> and executes
 * it against a real (jsdom) document and localStorage. The three promises it
 * makes — light unless the store wrote "dark", never throws, never asks the
 * OS — are each a case below.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { THEME_STORAGE_KEY } from "@/store/theme.store"
import ThemeScript from "./ThemeScript"

afterEach(cleanup)

function run() {
  const { container } = render(<ThemeScript />)
  const text = container.querySelector("script")?.textContent ?? ""
  expect(text).not.toBe("")
  // Executed exactly as a browser would: as script text, not as a module.
  new Function(text)()
  return document.documentElement.dataset.theme
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe("ThemeScript", () => {
  it("lands on light when nothing is stored", () => {
    expect(run()).toBe("light")
  })

  it("lands on dark when the store wrote dark, whatever the version", () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark" }, version: 7 })
    )

    expect(run()).toBe("dark")
  })

  it("lands on light for anything that is not the literal dark", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ state: { theme: "blue" }, version: 0 }),
      JSON.stringify({ theme: "dark" }),
      JSON.stringify("dark"),
      "null",
    ]) {
      localStorage.setItem(THEME_STORAGE_KEY, raw)
      expect(run(), raw).toBe("light")
    }
  })

  it("survives a localStorage that throws (private mode), on light", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })

    expect(() => run()).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("never consults the OS colour scheme", () => {
    const matchMedia = vi.fn()
    vi.stubGlobal("matchMedia", matchMedia)
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark" }, version: 0 })
    )

    run()

    expect(matchMedia).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
