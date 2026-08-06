/**
 * The name ladder.
 *
 * The invariant that matters is the last one: Satori draws an overflowing line
 * off the edge of the card rather than shrinking it, so the width the ladder
 * produces has to fit inside the frame for EVERY name, not just the ones
 * somebody thought of.
 */

import { describe, expect, it } from "vitest"

import { nameFontSize, nameLines } from "../nameLadder"

/** Mirrors the ratio the ladder itself uses to bound an unbreakable word. */
const CHAR_WIDTH_RATIO = 0.52
const FRAME = { story: 1080 - 160, link: 1200 - 112 }

const longestWord = (name: string) =>
  name.trim().split(/\s+/).reduce((n, w) => Math.max(n, w.length), 0)

describe("the rungs", () => {
  // Keyed on the LONGEST WORD: 4 / 11 / 13 / 15 characters here.
  it.each([
    ["Ravi Nair", 180, 96],
    ["Rajalakshmi Nair", 150, 82],
    ["Chandrasekhar Nair", 124, 68],
    ["Subramanian Venkataraghavan", 104, 58],
  ])("%s → %ipx story / %ipx link", (name, story, link) => {
    expect(nameFontSize(name, "story")).toBe(story)
    expect(nameFontSize(name, "link")).toBe(link)
  })

  it("measures the longest WORD, not the total length", () => {
    // Same total length, very different longest word. A long name of short
    // words splits across two comfortable lines; one long word cannot.
    expect(nameFontSize("Raj Roy Nair Das", "story")).toBe(180)
    expect(nameFontSize("Chandrasekharan", "story")).toBeLessThan(180)
  })
})

describe("no name overflows the frame", () => {
  it.each(["story", "link"] as const)("%s", (format) => {
    for (let length = 1; length <= 60; length++) {
      const name = "W".repeat(length)
      const width = length * nameFontSize(name, format) * CHAR_WIDTH_RATIO

      expect(
        width,
        `${length}-character word at ${nameFontSize(name, format)}px`
      ).toBeLessThanOrEqual(FRAME[format])
    }
  })

  it("keeps a 30-character single word inside the story frame", () => {
    const name = "Venkataraghavanchandrasekharan"
    expect(name).toHaveLength(30)

    const width = longestWord(name) * nameFontSize(name, "story") * CHAR_WIDTH_RATIO
    expect(width).toBeLessThanOrEqual(FRAME.story)
  })

  it("never shrinks below a legible floor", () => {
    expect(nameFontSize("W".repeat(200), "story")).toBeGreaterThanOrEqual(24)
  })
})

describe("line splitting", () => {
  it("splits the story card on the last space, so the surname gets its own line", () => {
    expect(nameLines("Aravind Kumar Menon", "story")).toEqual(["Aravind Kumar", "Menon"])
  })

  it("keeps the link card on one line — it is a wide, short frame", () => {
    expect(nameLines("Aravind Kumar Menon", "link")).toEqual(["Aravind Kumar Menon"])
  })

  it("leaves a single-word name alone", () => {
    expect(nameLines("Aravind", "story")).toEqual(["Aravind"])
  })

  it("collapses stray whitespace rather than rendering an empty line", () => {
    expect(nameLines("  Aravind   Menon  ", "story")).toEqual(["Aravind", "Menon"])
    expect(nameLines("   ", "story")).toEqual([""])
  })
})
