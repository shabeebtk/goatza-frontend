/**
 * The vanity redirect.
 *
 * Three things are worth pinning. The reserved list must short-circuit BEFORE
 * the backend call, or a crawler walking the root costs a round trip per guess.
 * The destination must be picked from the bundle's own `type`, or an
 * organization lands on the user profile route and 404s there. And an unknown
 * name must be indistinguishable from a hidden one, for the same reason the
 * card renderer refuses to tell them apart.
 *
 * The bundle fetches are stubbed: these are assertions about this route's rules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getPublicUserProfile = vi.hoisted(() => vi.fn())
const getPublicOrganizationProfile = vi.hoisted(() => vi.fn())

vi.mock("@/features/profile/services/publicProfile.api", () => ({
  getPublicUserProfile,
  getPublicOrganizationProfile,
}))

const { GET } = await import("./route")

const request = (path: string) => new Request(`https://goatza.com/${path}`)
const params = (username: string) => ({ params: Promise.resolve({ username }) })

const userBundle = (username = "aravind10") => ({
  type: "user" as const,
  profile: { username },
})

const orgBundle = (username = "calicutfc") => ({
  type: "organization" as const,
  profile: { username },
})

/** The route's own return, with the Location resolved to a path. */
async function go(username: string, path = username) {
  const response = await GET(request(path), params(username))
  const location = response.headers.get("Location")

  return {
    status: response.status,
    path: location ? new URL(location).pathname + new URL(location).search : null,
    cacheControl: response.headers.get("Cache-Control"),
  }
}

beforeEach(() => {
  getPublicUserProfile.mockReset().mockResolvedValue(null)
  getPublicOrganizationProfile.mockReset().mockResolvedValue(null)
})

describe("reserved names", () => {
  // Every one of these is already claimed by a static route, a generated file
  // or something Next/Vercel serves from outside the router, so in practice the
  // request never arrives. The list is what guarantees that stays true when
  // somebody registers the username `settings`.
  it.each([
    "api",
    "_next",
    "auth",
    "card",
    "chat",
    "coaching",
    "explore",
    "highlights",
    "home",
    "messages",
    "notifications",
    "organization",
    "posts",
    "profile",
    "recruitments",
    "scouting",
    "search",
    "settings",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "manifest.json",
    "icons",
    "fonts",
  ])("404s on %s", async (name) => {
    expect((await go(name)).status).toBe(404)
  })

  it("costs no backend call", async () => {
    await go("settings")

    expect(getPublicUserProfile).not.toHaveBeenCalled()
    expect(getPublicOrganizationProfile).not.toHaveBeenCalled()
  })

  it("is case-insensitive — a URL is typed by a person", async () => {
    expect((await go("Settings")).status).toBe(404)
  })
})

describe("a user", () => {
  beforeEach(() => {
    getPublicUserProfile.mockResolvedValue(userBundle())
  })

  it("308s to the profile page", async () => {
    expect(await go("aravind10")).toMatchObject({
      status: 308,
      path: "/profile/aravind10",
    })
  })

  it("is cached for five minutes", async () => {
    expect((await go("aravind10")).cacheControl).toBe("public, max-age=300")
  })

  it("does not cost the organization lookup", async () => {
    await go("aravind10")
    expect(getPublicOrganizationProfile).not.toHaveBeenCalled()
  })

  it("carries the query string through", async () => {
    // A 308 that drops the query silently loses whatever brought the visitor
    // here — `?ref=card` today, a campaign tag tomorrow.
    expect((await go("aravind10", "aravind10?ref=card")).path).toBe(
      "/profile/aravind10?ref=card"
    )
  })

  it("redirects to the username the backend returned, not the one typed", async () => {
    // Usernames are case-insensitively unique on the backend; the canonical
    // spelling is the one in the bundle, and the canonical URL has to use it.
    getPublicUserProfile.mockResolvedValue(userBundle("aravind10"))
    expect((await go("Aravind10")).path).toBe("/profile/aravind10")
  })
})

describe("an organization", () => {
  beforeEach(() => {
    // /public/profile/ 404s for an org rather than returning its bundle, so the
    // org endpoint is a second call rather than a different branch of the first.
    getPublicUserProfile.mockResolvedValue(null)
    getPublicOrganizationProfile.mockResolvedValue(orgBundle())
  })

  it("308s to the organization profile page", async () => {
    expect(await go("calicutfc")).toMatchObject({
      status: 308,
      path: "/organization/profile/calicutfc",
    })
  })

  it("is routed by the bundle's own type, not by which call answered", async () => {
    expect((await go("calicutfc")).path).toContain("/organization/")
  })
})

describe("an unknown name", () => {
  it("404s after trying both", async () => {
    expect((await go("nobody")).status).toBe(404)
    expect(getPublicUserProfile).toHaveBeenCalledWith("nobody")
    expect(getPublicOrganizationProfile).toHaveBeenCalledWith("nobody")
  })

  it("is briefly cacheable, so a dead link is not a round trip every time", async () => {
    expect((await go("nobody")).cacheControl).toBe("public, max-age=60")
  })

  it("is indistinguishable from a hidden profile", async () => {
    // The bundle endpoint already collapses hidden, deactivated, usernameless
    // and nonexistent into one null. All four have to land identically here or
    // this route becomes a way to enumerate accounts behind the public toggle.
    const missing = await go("nobody")

    getPublicUserProfile.mockResolvedValue(null)
    const hidden = await go("aravind10")

    expect(hidden).toEqual(missing)
  })

  it("404s on a bundle with no username, however it got there", async () => {
    getPublicUserProfile.mockResolvedValue({ type: "user", profile: { username: "" } })
    expect((await go("aravind10")).status).toBe(404)
  })
})
