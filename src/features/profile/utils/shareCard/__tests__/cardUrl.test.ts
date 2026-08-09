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

  it("keeps the slots param canonically sorted", () => {
    const a = buildCardUrl({ username: "rahul7", format: "story", slots: ["city", "height"] })
    const b = buildCardUrl({ username: "rahul7", format: "story", slots: ["height", "city"] })

    expect(a).toBe(b)
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

/**
 * The QR param exists to be ABSENT.
 *
 * On is the default, and the canonical URL for the default is the URL that
 * existed before the QR did. Emitting `qr=1` would be harmless to look at and
 * expensive in practice: every card already cached at the CDN and every OG tag
 * already scraped points at the param-free form, and a second spelling of the
 * same image is a second cache entry, a second render and a halved hit rate.
 */
describe("the qr param", () => {
  const story = (qr?: boolean) =>
    buildCardUrl({ username: "rahul7", format: "story", qr })

  it("is omitted when the QR is on, which is the default", () => {
    expect(story()).not.toContain("qr=")
    expect(story(true)).not.toContain("qr=")
  })

  it("leaves the default story URL byte-identical to the pre-QR one", () => {
    expect(story()).toBe(story(true))
  })

  it("spells out only the deviation", () => {
    expect(story(false)).toContain("qr=0")
  })

  it("is never emitted for a link card, on or off", () => {
    for (const qr of [true, false, undefined]) {
      expect(buildCardUrl({ username: "rahul7", format: "link", qr })).not.toContain("qr=")
    }
  })

  it("does not disturb the slots param", () => {
    const url = buildCardUrl({
      username: "rahul7",
      format: "story",
      slots: ["height", "city"],
      qr: false,
    })

    expect(new URL(url, "https://goatza.com").searchParams.get("slots")).toBe("city,height")
  })
})
