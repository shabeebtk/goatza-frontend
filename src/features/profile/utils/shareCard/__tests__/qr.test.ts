/**
 * The QR geometry.
 *
 * What matters here is not that the library works — it does — but that the walk
 * over its bitmatrix produces the symbol the reader will actually see. A
 * transposed matrix, an off-by-one on the module coordinates or a path that
 * silently comes back empty all still render something QR-shaped on the card,
 * and all three scan to the wrong thing or to nothing.
 *
 * The decode itself is asserted where it belongs: in preview.test.tsx's output,
 * which goes through Satori and back out as pixels. These are the arithmetic.
 */

import { describe, expect, it } from "vitest"

import { qrShape } from "../qr"

const URL = "https://goatza.com/profile/aravind10?ref=card"

/** True when the module at (x, y) is drawn. The path is a run of independent
 *  1×1 subpaths, so membership is a substring test. */
const has = (d: string, x: number, y: number) => d.includes(`M${x} ${y}h1v1h-1z`)

describe("qrShape", () => {
  it("is deterministic for the same input", () => {
    expect(qrShape(URL)).toEqual(qrShape(URL))
  })

  it("draws something", () => {
    const { d } = qrShape(URL)

    expect(d.length).toBeGreaterThan(0)
    expect(d.startsWith("M")).toBe(true)
  })

  it("has an odd module count, as every QR version does", () => {
    // Versions are 21, 25, 29 … 4n+17. An even size means the walk read the
    // wrong dimension off the matrix.
    expect(qrShape(URL).size % 2).toBe(1)
  })

  it("needs a bigger symbol for a longer URL", () => {
    const short = qrShape("https://goatza.com/profile/ab?ref=card")
    const long = qrShape(
      `https://goatza.com/profile/${"a".repeat(49)}?ref=card`
    )

    expect(long.size).toBeGreaterThan(short.size)
  })

  it("stays inside its own viewBox", () => {
    const { d, size } = qrShape(URL)

    // Every coordinate the path names must be a valid module index — this is
    // what pins the viewBox in ProfileCard to the geometry drawn under it.
    for (const [, x, y] of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      expect(Number(x)).toBeLessThan(size)
      expect(Number(y)).toBeLessThan(size)
    }
  })

  describe("the three finder patterns", () => {
    // Top-left, top-right, bottom-left. A reader locates the symbol by these
    // before it decodes a single bit, and their absence is the one defect that
    // makes a QR unscannable rather than merely wrong. There is no fourth: the
    // bottom-right corner is data, which is how orientation is recovered.
    const { d, size } = qrShape(URL)
    const last = size - 1

    it.each([
      ["top-left", 0, 0],
      ["top-right", last, 0],
      ["bottom-left", 0, last],
    ])("%s corner is dark", (_name, x, y) => {
      expect(has(d, x, y)).toBe(true)
    })

    it.each([
      ["top-left", 1, 1],
      ["top-right", last - 1, 1],
      ["bottom-left", 1, last - 1],
    ])("%s has its light ring", (_name, x, y) => {
      // The finder is a 7×7 ring: dark border, light gap, dark 3×3 core. The
      // gap at (1,1) is what a transposed or shifted walk loses first.
      expect(has(d, x, y)).toBe(false)
    })
  })

  it("encodes different text differently", () => {
    expect(qrShape(`${URL}x`).d).not.toBe(qrShape(URL).d)
  })
})
