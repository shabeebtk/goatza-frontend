/**
 * The card actually renders, at the declared size, in every fallback state.
 *
 * These go through the real Satori pipeline rather than asserting on a React
 * tree, because the failure mode this feature has is Satori refusing something
 * a browser accepts — a missing `display: flex`, an em letter-spacing, a `<br>`.
 * A tree assertion would pass on all three.
 *
 * Network is stubbed: Satori fetches every image URL inside the render, and a
 * test that reached the network would be slow and flaky. The stub returns a real
 * 1×1 PNG so the image path is genuinely exercised.
 */

import { describe, expect, it, beforeAll, afterAll, vi } from "vitest"
import { ImageResponse } from "next/og"

import ProfileCard from "../ProfileCard"
import { toCardData } from "../cardData"
import { cardFonts } from "../fonts"
import { CARD_SIZES, type CardFormat } from "../types"
import { bundle } from "./fixtures"

/** 1×1 transparent PNG. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

const realFetch = globalThis.fetch

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes("media.goatza")) {
      return new Response(PIXEL, { headers: { "Content-Type": "image/png" } })
    }
    return realFetch(input as RequestInfo)
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

/** What the route would encode: absolute, and tagged as reached from a card. */
const QR = "https://goatza.com/profile/aravind10?ref=card"

async function render(
  format: CardFormat,
  b = bundle(),
  slots?: string,
  qrUrl: string | null = QR
) {
  const data = toCardData(b, format, slots, qrUrl)
  const { width, height } = CARD_SIZES[format]

  const response = new ImageResponse(<ProfileCard data={data} format={format} />, {
    width,
    height,
    fonts: await cardFonts(),
  })

  return Buffer.from(await response.arrayBuffer())
}

/** Width and height straight out of the PNG IHDR chunk, which starts at byte 16
 *  of every PNG. Cheaper and more exact than decoding the image. */
function pngSize(png: Buffer) {
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG")
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe("both formats", () => {
  it("story renders a PNG at exactly 1080×1920", async () => {
    expect(pngSize(await render("story"))).toEqual({ width: 1080, height: 1920 })
  })

  it("link renders a PNG at exactly 1200×630", async () => {
    expect(pngSize(await render("link"))).toEqual({ width: 1200, height: 630 })
  })
})

describe("fallbacks", () => {
  it("renders with no avatar", async () => {
    const png = await render("story", bundle({ profile_photo: "" }))
    expect(pngSize(png).height).toBe(1920)
  })

  it("renders with no cover", async () => {
    const png = await render("story", bundle({ cover_photo: "" }))
    expect(pngSize(png).height).toBe(1920)
  })

  it("renders with no verified club", async () => {
    const png = await render("story", bundle({}, []))
    expect(pngSize(png).height).toBe(1920)
  })

  it("renders with all three missing at once", async () => {
    const png = await render(
      "story",
      bundle({ profile_photo: "", cover_photo: "" }, [])
    )
    expect(pngSize(png).height).toBe(1920)
  })

  it("renders a brand-new profile with nothing filled in", async () => {
    const png = await render(
      "story",
      bundle(
        {
          profile_photo: "",
          cover_photo: "",
          height_cm: null,
          weight_kg: null,
          age_group: null,
          location: null,
          primary_sport: null,
        },
        []
      )
    )
    expect(pngSize(png).height).toBe(1920)
  })
})

describe("the QR footer", () => {
  // Satori draws inline SVG, but a `<path>` with a few hundred subpaths is the
  // largest single node on the card and the one most likely to be refused
  // outright. These render it for real rather than asserting on a tree.
  it("renders the story card with a QR", async () => {
    expect(pngSize(await render("story"))).toEqual({ width: 1080, height: 1920 })
  })

  it("renders the story card without one", async () => {
    expect(pngSize(await render("story", bundle(), undefined, null))).toEqual({
      width: 1080,
      height: 1920,
    })
  })

  it("renders a 50-character username, which is the backend's column width", async () => {
    // The longest URL the QR can be asked to carry — a denser symbol — beside
    // the widest thing the footer's left column can print.
    const png = await render(
      "story",
      bundle({ username: "a".repeat(50) }),
      undefined,
      `https://goatza.com/profile/${"a".repeat(50)}?ref=card`
    )
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("keeps the QR off the link card even when one is passed", async () => {
    // The layout is dumb by design, so the rule lives in the adapter. This is
    // the second lock on it; the route holds the first.
    expect(toCardData(bundle(), "link", undefined, QR).qrUrl).toBeNull()
    expect(toCardData(bundle(), "story", undefined, QR).qrUrl).toBe(QR)
  })

  it("renders the link card unchanged", async () => {
    expect(pngSize(await render("link"))).toEqual({ width: 1200, height: 630 })
  })
})

describe("the name ladder holds the frame", () => {
  // Satori draws an overflowing line straight off the edge rather than
  // shrinking it, so the check is that the card is still exactly 1080 wide —
  // an overflow would not resize the frame, but the ladder is what stops the
  // glyphs leaving it, and this at least pins that a 30-character name renders
  // at all. The arithmetic itself is covered in nameLadder.test.ts.
  it("renders a 30-character single-word name", async () => {
    const png = await render(
      "story",
      bundle({ name: "Venkataraghavanchandrasekharan" })
    )
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })
})
