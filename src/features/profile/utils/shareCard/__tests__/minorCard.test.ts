/**
 * A minor's share card carries no photograph, no measurements and no age band.
 *
 * Pinned here rather than left to the backend's stripping alone, because this
 * adapter is the last thing between the payload and an IMAGE — and an image is
 * the one artifact in this codebase that cannot be recalled. Once a card has
 * been fetched by a chat app or a crawler it has been copied onto servers
 * nobody here controls, so "the server already emptied those fields" is a
 * reason for the gate to be cheap, not a reason to omit it.
 *
 * The fixtures deliberately keep the photo and the measurements POPULATED and
 * flip only `is_limited_view`. That is the case the explicit gate exists for: a
 * richer payload reaching this function from somewhere else — an authenticated
 * endpoint, an owner preview, a future card editor — must still produce a
 * stripped card.
 */

import { describe, expect, it } from "vitest"

import { toCardData } from "../cardData"
import { bundle } from "./fixtures"

const minor = () => bundle({ is_minor: true, is_limited_view: true })

describe("a minor's card", () => {
  it("draws no avatar, even when the payload still carries one", () => {
    expect(toCardData(minor(), "link", null).avatarUrl).toBeNull()
  })

  it("draws no cover, even when the payload still carries one", () => {
    expect(toCardData(minor(), "link", null).coverUrl).toBeNull()
  })

  it("prints no age band", () => {
    // The fixture is "U19". A U-band beside a named child on an image that
    // travels through chat apps is an age-targeting signal.
    expect(toCardData(minor(), "link", null).ageGroup).toBeNull()
  })

  it("keeps the name, sport and position — the card still has to be worth sharing", () => {
    const data = toCardData(minor(), "link", null)

    expect(data.name).toBe("Aravind Menon")
    expect(data.sport).toBe("Football")
    expect(data.position).toBe("Winger")
  })

  it("applies to the story format too, not just the crawler's link card", () => {
    const data = toCardData(minor(), "story", null, "https://goatza.test/p/x")

    expect(data.avatarUrl).toBeNull()
    expect(data.coverUrl).toBeNull()
    expect(data.ageGroup).toBeNull()
  })
})

describe("an adult's card", () => {
  it("is completely unaffected", () => {
    const data = toCardData(bundle(), "link", null)

    expect(data.avatarUrl).toContain("profile.webp")
    expect(data.coverUrl).toContain("cover.webp")
    expect(data.ageGroup).toBe("U19")
  })
})
