/**
 * `sitemap.ts` — the file robots.ts already points crawlers at.
 *
 * The two tests that matter are the degradation ones. A sitemap route runs at
 * build/revalidate time with no user watching it, so the failure mode is not "a
 * wrong URL" but "the whole route threw and the site has no sitemap at all" —
 * and nothing would tell us. Both an unset site origin and an unreachable API
 * must still produce a usable file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SITE_URL",
  "API_ORIGIN",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
] as const

const SITE = "https://goatza.com"

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const key of ENV_KEYS) delete process.env[key]
  vi.stubGlobal("fetch", vi.fn())
  // The server branch of the API base resolution is the one under test.
  vi.stubGlobal("window", undefined)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function load() {
  vi.resetModules()
  return (await import("./sitemap")).default
}

function feedResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) }
}

const FEED = {
  users: [{ username: "striker", updated_at: "2026-09-01T10:00:00+00:00" }],
  organizations: [
    { username: "dreamfc", updated_at: "2026-08-20T08:30:00+00:00" },
  ],
}

function urls(entries: Array<{ url: string }>) {
  return entries.map((entry) => entry.url)
}

describe("static entries", () => {
  it("always lists home and the four legal pages, absolute", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      feedResponse({ users: [], organizations: [] })
    )

    const entries = await (await load())()

    expect(urls(entries)).toEqual([
      `${SITE}/`,
      `${SITE}/terms`,
      `${SITE}/privacy`,
      `${SITE}/guidelines`,
      `${SITE}/safety`,
    ])
  })

  it("strips a trailing slash off the configured site URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://goatza.com/"
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      feedResponse({ users: [], organizations: [] })
    )

    const entries = await (await load())()

    // Not "https://goatza.com//" — robots.ts strips the same way.
    expect(entries[0].url).toBe(`${SITE}/`)
  })

  it("gives home the highest priority and legal pages the lowest", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      feedResponse({ users: [], organizations: [] })
    )

    const entries = await (await load())()

    expect(entries[0].priority).toBe(1)
    expect(entries[1].priority).toBe(0.3)
    expect(entries[1].changeFrequency).toBe("monthly")
  })
})

describe("profile entries", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(feedResponse(FEED))
  })

  it("maps users and orgs onto their public route shapes", async () => {
    const entries = await (await load())()

    expect(urls(entries)).toContain(`${SITE}/profile/striker`)
    expect(urls(entries)).toContain(
      `${SITE}/organization/profile/dreamfc`
    )
  })

  it("carries lastModified from updated_at", async () => {
    const entries = await (await load())()
    const profile = entries.find(
      (entry) => entry.url === `${SITE}/profile/striker`
    )

    expect(profile?.lastModified).toEqual(new Date(FEED.users[0].updated_at))
    expect(profile?.changeFrequency).toBe("weekly")
  })

  it("drops an unparseable timestamp rather than emitting Invalid Date", async () => {
    // "Invalid Date" serializes into the XML as that literal string and makes
    // the whole <url> entry unusable to a crawler. No hint beats a broken one.
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      feedResponse({
        users: [{ username: "striker", updated_at: "not-a-date" }],
        organizations: [],
      })
    )

    const entries = await (await load())()
    const profile = entries.find(
      (entry) => entry.url === `${SITE}/profile/striker`
    )

    expect(profile).toBeDefined()
    expect(profile?.lastModified).toBeUndefined()
  })

  it("never lists recruitment detail pages", async () => {
    // They are in the authenticated route group and robots.ts disallows
    // /recruitments — the org profile is the indexable unit instead.
    const entries = await (await load())()

    expect(urls(entries).some((url) => url.includes("/recruitments"))).toBe(
      false
    )
  })

  it("fetches the feed on an hourly revalidate window", async () => {
    await (await load())()

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.next).toEqual({ revalidate: 3600 })
  })
})

describe("degradation", () => {
  it("returns the static entries when the API is unreachable", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNREFUSED")
    )

    const entries = await (await load())()

    expect(urls(entries)).toEqual([
      `${SITE}/`,
      `${SITE}/terms`,
      `${SITE}/privacy`,
      `${SITE}/guidelines`,
      `${SITE}/safety`,
    ])
  })

  it("returns the static entries when the API answers a 5xx", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = SITE
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })

    const entries = await (await load())()

    expect(entries).toHaveLength(5)
  })

  it("falls back to relative static paths with no site origin", async () => {
    // Nothing set: no NEXT_PUBLIC_SITE_URL and none of Vercel's injected vars.
    const entries = await (await load())()

    expect(urls(entries)).toEqual([
      "/",
      "/terms",
      "/privacy",
      "/guidelines",
      "/safety",
    ])
    // And it does not try to build profile URLs it cannot make absolute.
    expect(fetch).not.toHaveBeenCalled()
  })
})
