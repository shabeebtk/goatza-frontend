/**
 * The founding-player card actually renders, at 1080×1920, in every state it
 * can be handed.
 *
 * Through the real Satori pipeline rather than against a React tree, for the
 * same reason shareCard's render test is: the failure mode of a Satori layout
 * is Satori refusing something a browser accepts — a missing `display: flex`,
 * an em letter-spacing, a gradient it cannot parse. A tree assertion passes on
 * all three and the card is still a 500 in production.
 *
 * No network stub is needed here, unlike the profile card's: this card fetches
 * nothing inside the render. It has no avatar, no cover and no QR.
 *
 * AND THE PIXELS ARE CHECKED, not just the dimensions. Satori does not shrink
 * text to fit and does not reflow an overflowing line — it draws it straight
 * off the edge of the frame, and the PNG that comes back is exactly 1080×1920
 * either way. A size assertion cannot tell those two apart, so `inkInMargin`
 * decodes the image and looks for drawn pixels where the padding is supposed to
 * be. That is the assertion that actually protects the longest name and the
 * five-digit number.
 */

import { describe, expect, it } from "vitest"
import { ImageResponse } from "next/og"
import { PNG } from "pngjs"

import FoundingPlayerCard from "../FoundingPlayerCard"
import type { FoundingPlayerCardData } from "../FoundingPlayerCard"
import { buildJoinCardUrl, joinCardFileName } from "../cardUrl"
import { cardFonts } from "@/features/profile/utils/shareCard/fonts"
import { CARD_SIZES } from "@/features/profile/utils/shareCard/types"

function data(overrides: Partial<FoundingPlayerCardData> = {}): FoundingPlayerCardData {
  return {
    name: "Arjun Menon",
    signupNumber: 47,
    city: "Kozhikode",
    countryCode: "IN",
    isFounding: true,
    ...overrides,
  }
}

async function render(d: FoundingPlayerCardData) {
  const { width, height } = CARD_SIZES.story

  const response = new ImageResponse(<FoundingPlayerCard data={d} />, {
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

/**
 * The card's own padding, and how much of it must stay empty.
 *
 * The layout pads by 80. Checking the full 80 would fail on a glyph's natural
 * side bearing, so the band checked is the OUTER 40 — half the padding. Ink
 * there means a line is at least 40px into space that was meant to be margin,
 * which on a 1080-wide card is a line on its way off the edge.
 */
const MARGIN = 40

/**
 * Is anything DRAWN in the margin?
 *
 * "Drawn" is by luminance, not by an exact colour match: the card's ground is
 * #0A0A0A under a green wash that lifts the top of the frame to roughly 28,
 * while the dimmest thing the card ever draws (FAINT, #556655) sits at ~95.
 * A threshold of 60 lands between them with room on both sides, so this
 * separates type from background without knowing which line it found.
 */
function inkInMargin(png: Buffer): { x: number; y: number; lum: number } | null {
  const image = PNG.sync.read(png)

  const at = (x: number, y: number) => {
    const index = (image.width * y + x) << 2
    const [r, g, b] = [image.data[index], image.data[index + 1], image.data[index + 2]]
    // Rec. 601 luma — the same weighting a person's eye applies.
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  const inMargin = (x: number, y: number) =>
    x < MARGIN ||
    x >= image.width - MARGIN ||
    y < MARGIN ||
    y >= image.height - MARGIN

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!inMargin(x, y)) continue
      const lum = at(x, y)
      if (lum > 60) return { x, y, lum: Math.round(lum) }
    }
  }

  return null
}

/** Renders, then asserts both the frame and that nothing spilled into it. */
async function renderAndFit(d: FoundingPlayerCardData) {
  const png = await render(d)
  expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  expect(inkInMargin(png)).toBeNull()
  return png
}

describe("the margin check itself", () => {
  it("catches type drawn where the padding should be", async () => {
    // A guard against a vacuous assertion. If `inkInMargin` could not fail,
    // every fit test above would pass on a card with the name printed off the
    // edge — which is the exact bug it is there to prevent.
    const response = new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1920,
            display: "flex",
            background: "#0A0A0A",
            color: "#fff",
            fontFamily: "Bebas Neue",
            fontSize: 90,
          }}
        >
          <span style={{ marginLeft: 4 }}>OFF THE EDGE</span>
        </div>
      ),
      { width: 1080, height: 1920, fonts: await cardFonts() },
    )

    const png = Buffer.from(await response.arrayBuffer())
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
    expect(inkInMargin(png)).not.toBeNull()
  })

  it("passes a frame that is empty in the margin", async () => {
    const response = new ImageResponse(
      (
        <div
          style={{
            width: 1080,
            height: 1920,
            display: "flex",
            background: "#0A0A0A",
            color: "#fff",
            fontFamily: "Bebas Neue",
            fontSize: 90,
            padding: 200,
          }}
        >
          <span>WELL INSIDE</span>
        </div>
      ),
      { width: 1080, height: 1920, fonts: await cardFonts() },
    )

    expect(inkInMargin(Buffer.from(await response.arrayBuffer()))).toBeNull()
  })
})

describe("FoundingPlayerCard", () => {
  it("renders at the story size", async () => {
    const png = await renderAndFit(data())

    // A card that rendered but drew nothing would still be a valid PNG. Real
    // output at this size is comfortably past this floor.
    expect(png.byteLength).toBeGreaterThan(10_000)
  })

  it("draws the whole hierarchy, not just the parts that fit", async () => {
    // The redesign's shape, asserted the only way a rasteriser allows: the
    // name is the anchor and the tagline is a second block of type, so the
    // card carries materially more ink than the old number-on-a-background.
    const png = await renderAndFit(data())
    expect(png.byteLength).toBeGreaterThan(20_000)
  })

  it("renders with no place at all", async () => {
    // A player who skipped the city picker. The line becomes "#47" alone
    // rather than "#47 · " with a dangling separator.
    await renderAndFit(data({ city: null, countryCode: null }))
  })

  it("renders with a city but no country code", async () => {
    await renderAndFit(data({ countryCode: null }))
  })

  it("renders a player outside the founding cohort", async () => {
    // Same layout, different eyebrow — the card must not title somebody it
    // cannot back up.
    await renderAndFit(data({ isFounding: false, signupNumber: 1204 }))
  })

  it("renders a city from outside India", async () => {
    await renderAndFit(data({ city: "Manchester", countryCode: "GB" }))
  })

  it("renders a single-word name", async () => {
    await renderAndFit(data({ name: "Arjun" }))
  })

  it("renders number 1", async () => {
    await renderAndFit(data({ signupNumber: 1 }))
  })

  // ── The two cases the ladder exists for ──────────────────────

  it("keeps the longest realistic name inside the frame", async () => {
    // 27 characters, longest word 15 — the bottom rung of the ladder, and the
    // name the ladder's own docstring names as its worst case.
    await renderAndFit(data({ name: "Subramanian Venkataraghavan" }))
  })

  it("keeps an unbroken 20-character surname inside the frame", async () => {
    // Worse than any real name and the case the clamp (rather than the rung)
    // has to catch: one word that cannot be split anywhere.
    await renderAndFit(data({ name: "Thiruvananthapurathu Balasubramaniam" }))
  })

  it("keeps a five-digit number and a long city on one line", async () => {
    // "#99999 · Thiruvananthapuram, IN" — the widest that quiet line can get.
    await renderAndFit(
      data({
        signupNumber: 99999,
        city: "Thiruvananthapuram",
        countryCode: "IN",
      }),
    )
  })

  it("keeps the longest name and the largest number together", async () => {
    // Both worst cases in one card, which is the only combination that can
    // fail on vertical space rather than on width.
    await renderAndFit(
      data({ name: "Subramanian Venkataraghavan", signupNumber: 99999 }),
    )
  })
})

describe("buildJoinCardUrl", () => {
  it("is outside /api/, which vercel.json rewrites to Django", () => {
    expect(buildJoinCardUrl("GZ0047").startsWith("/api")).toBe(false)
    expect(buildJoinCardUrl("GZ0047")).toBe("/card/join/GZ0047")
  })

  it("carries no query string — one ref code is one immutable image", () => {
    expect(buildJoinCardUrl("GZ0047")).not.toContain("?")
  })

  it("takes an absolute origin for callers that leave the page", () => {
    expect(buildJoinCardUrl("GZ0047", { origin: "https://goatza.com" })).toBe(
      "https://goatza.com/card/join/GZ0047",
    )
  })

  it("encodes the ref so a hand-typed code cannot escape the path", () => {
    expect(buildJoinCardUrl("GZ 47/../x")).toBe("/card/join/GZ%2047%2F..%2Fx")
  })

  it("names the file after the ref", () => {
    expect(joinCardFileName("GZ0047")).toBe("goatza-founding-player-GZ0047.png")
  })
})
