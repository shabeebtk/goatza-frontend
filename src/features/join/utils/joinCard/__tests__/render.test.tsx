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
 */

import { describe, expect, it } from "vitest"
import { ImageResponse } from "next/og"

import FoundingPlayerCard from "../FoundingPlayerCard"
import type { FoundingPlayerCardData } from "../FoundingPlayerCard"
import { buildJoinCardUrl, joinCardFileName } from "../cardUrl"
import { cardFonts } from "@/features/profile/utils/shareCard/fonts"
import { CARD_SIZES } from "@/features/profile/utils/shareCard/types"

function data(overrides: Partial<FoundingPlayerCardData> = {}): FoundingPlayerCardData {
  return {
    name: "Arjun Menon",
    signupNumber: 47,
    district: "Kozhikode",
    position: "Striker",
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

describe("FoundingPlayerCard", () => {
  it("renders at the story size", async () => {
    const png = await render(data())

    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
    // A card that rendered but drew nothing would still be a valid PNG. Real
    // output at this size is comfortably past this floor.
    expect(png.byteLength).toBeGreaterThan(10_000)
  })

  it("renders with neither district nor position", async () => {
    const png = await render(data({ district: null, position: null }))
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("renders with only one of the two", async () => {
    const png = await render(data({ position: null }))
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("renders a single-word name", async () => {
    const png = await render(data({ name: "Arjun" }))
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("renders the longest name and the largest number without falling over", async () => {
    const png = await render(
      data({ name: "Subramanian Venkataraghavan", signupNumber: 99999 }),
    )
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("renders number 1", async () => {
    const png = await render(data({ signupNumber: 1 }))
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
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
