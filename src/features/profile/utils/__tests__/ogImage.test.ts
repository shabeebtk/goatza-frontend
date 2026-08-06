/**
 * The share-card seam.
 *
 * A user profile's OG image is now the generated card; an organization's is
 * still the Cloudinary transform, because org cards are a different job and
 * deliberately not built. What these pin is that the swap happened and that it
 * did not take the org path with it.
 */

import { describe, expect, it } from "vitest"

import { buildProfileOgImageUrl } from "../ogImage"

const ORIGIN = "https://goatza.com"
const CLOUDINARY = "https://res.cloudinary.com/goatza/image/upload/v1/logo.jpg"

const user = (overrides = {}) => ({
  username: "aravind10",
  updated_at: "2026-08-01T09:00:00Z",
  profile_photo: "",
  cover_photo: "",
  ...overrides,
})

const org = (overrides = {}) => ({
  username: "calicutfc",
  logo: CLOUDINARY,
  cover_image: "",
  ...overrides,
})

describe("a user profile", () => {
  it("resolves to the generated card at the link format", () => {
    const url = new URL(buildProfileOgImageUrl(user(), ORIGIN))

    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe("/card/profile/aravind10")
    expect(url.searchParams.get("format")).toBe("link")
  })

  it("carries a version tag that moves when the profile is edited", () => {
    const before = new URL(buildProfileOgImageUrl(user(), ORIGIN))
    const after = new URL(
      buildProfileOgImageUrl(user({ updated_at: "2026-08-06T09:00:00Z" }), ORIGIN)
    )

    expect(before.searchParams.get("v")).toBeTruthy()
    expect(after.searchParams.get("v")).not.toBe(before.searchParams.get("v"))
  })

  it("is stable for an unedited profile, so the CDN entry survives", () => {
    expect(buildProfileOgImageUrl(user(), ORIGIN)).toBe(
      buildProfileOgImageUrl(user(), ORIGIN)
    )
  })

  it("still resolves to a card with no photo at all — the card draws its own fallbacks", () => {
    const url = buildProfileOgImageUrl(user({ profile_photo: "", cover_photo: "" }), ORIGIN)
    expect(url).toContain("/card/profile/")
  })

  it("escapes a username rather than pasting it into the path raw", () => {
    const url = buildProfileOgImageUrl(user({ username: "a b/c" }), ORIGIN)
    expect(url).toContain("/card/profile/a%20b%2Fc")
  })
})

describe("an organization", () => {
  it("keeps the Cloudinary transform — orgs have no generated card", () => {
    const url = buildProfileOgImageUrl(org(), ORIGIN)

    expect(url).not.toContain("/card/")
    expect(url).toContain("res.cloudinary.com")
    expect(url).toContain("c_fill,w_1200,h_630")
  })

  it("is routed by the SHAPE of the payload, not by whether a logo was uploaded", () => {
    // An org that has not uploaded a logo still carries the key, and must not
    // fall through to the user branch just because the value is empty.
    const url = buildProfileOgImageUrl(org({ logo: "" }), ORIGIN)
    expect(url).not.toContain("/card/")
  })

  it("falls back to the branded asset with no image at all", () => {
    expect(buildProfileOgImageUrl(org({ logo: "", cover_image: "" }), ORIGIN)).toBe(
      `${ORIGIN}/icons/icon-512.png`
    )
  })
})
