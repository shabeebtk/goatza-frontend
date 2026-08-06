/**
 * Where the card lives, and — mostly — where it must NOT live.
 *
 * The route was originally at /api/card/profile/<username>. `vercel.json`
 * rewrites every /api/:path* to Django, so in production the request never
 * reached the Next function: Django 404'd a path it had never heard of and the
 * share sheet showed a broken image. `next dev` does not apply `vercel.json`,
 * so local was perfect throughout.
 *
 * The first test is the guard. It is cheap and it would have caught this.
 */

import { describe, expect, it } from "vitest"

import { CARD_ROUTE, buildCardUrl } from "../cardUrl"

describe("card route placement", () => {
  it("is not under /api — that prefix is proxied to Django", () => {
    expect(CARD_ROUTE.startsWith("/api/")).toBe(false)
    expect(CARD_ROUTE).toBe("/card/profile")
  })

  it("keeps every built URL off /api", () => {
    const url = buildCardUrl({ username: "rahul7", format: "link" })
    expect(url.startsWith("/api/")).toBe(false)
    expect(url).toContain("/card/profile/rahul7")
  })
})

describe("buildCardUrl", () => {
  it("defaults to a relative URL for an <img src>", () => {
    const url = buildCardUrl({ username: "rahul7", format: "link" })
    expect(url.startsWith("/card/profile/")).toBe(true)
  })

  it("prefixes the origin for an OG tag, which must be absolute", () => {
    const url = buildCardUrl({
      username: "rahul7",
      format: "link",
      origin: "https://goatza.com",
    })
    expect(url.startsWith("https://goatza.com/card/profile/")).toBe(true)
  })

  it("encodes the username", () => {
    const url = buildCardUrl({ username: "a b/c", format: "link" })
    expect(url).toContain("/card/profile/a%20b%2Fc")
  })

  it("carries slots for a story and omits them for a link", () => {
    const story = buildCardUrl({
      username: "rahul7",
      format: "story",
      slots: ["city", "height"],
    })
    expect(story).toContain("slots=")

    const link = buildCardUrl({
      username: "rahul7",
      format: "link",
      slots: ["city", "height"],
    })
    expect(link).not.toContain("slots=")
  })

  it("moves the cache-buster when the profile changes", () => {
    const before = buildCardUrl({
      username: "rahul7",
      format: "link",
      updatedAt: "2026-07-15T16:12:43Z",
    })
    const after = buildCardUrl({
      username: "rahul7",
      format: "link",
      updatedAt: "2026-08-06T09:00:00Z",
    })

    expect(before).not.toBe(after)
  })
})
