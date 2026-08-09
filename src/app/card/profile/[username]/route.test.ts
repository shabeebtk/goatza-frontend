/**
 * The renderer route.
 *
 * The 404 matrix is the one that matters. A card is a public artifact that
 * travels through chat apps and gets cached at a CDN — rendering one for a
 * profile whose owner turned the public toggle off would leak, permanently and
 * in image form, exactly what that toggle exists to prevent.
 *
 * The bundle fetch is stubbed rather than hitting the API: these are assertions
 * about this route's rules, and the backend's own 404 matrix has its own tests
 * (accounts/tests/test_public_profile.py).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

import { bundle } from "@/features/profile/utils/shareCard/__tests__/fixtures"
import { resetRateLimit } from "@/features/profile/utils/shareCard/rateLimit"

const getPublicUserProfile = vi.hoisted(() => vi.fn())

vi.mock("@/features/profile/services/publicProfile.api", () => ({
  getPublicUserProfile,
}))

const { GET } = await import("./route")

/** 1×1 transparent PNG, for the Cloudinary fetches Satori makes mid-render. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)

function request(query = "", ip = "203.0.113.1") {
  return new Request(`https://goatza.com/card/profile/aravind10${query}`, {
    headers: { "x-forwarded-for": ip },
  }) as unknown as NextRequest
}

const params = (username = "aravind10") => ({ params: Promise.resolve({ username }) })

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

beforeEach(() => {
  resetRateLimit()
  getPublicUserProfile.mockReset()
  getPublicUserProfile.mockResolvedValue(bundle())

  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input).includes("res.cloudinary.com")) {
      return new Response(PIXEL, { headers: { "Content-Type": "image/png" } })
    }
    throw new Error(`Unexpected fetch: ${input}`)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("404 matrix", () => {
  // All four reasons collapse to one null at the bundle endpoint, deliberately,
  // so a visitor cannot tell a hidden profile from a deactivated one from a
  // typo. Each is listed anyway, because each is a separate reason a card must
  // not exist and a future refactor could reintroduce any one of them.
  it.each([
    "the profile does not exist",
    "the profile is hidden (is_public_profile off)",
    "the user is inactive",
    "the user has no username",
  ])("404s when %s", async () => {
    getPublicUserProfile.mockResolvedValue(null)

    const response = await GET(request(), params())

    expect(response.status).toBe(404)
    expect(response.headers.get("Content-Type")).toContain("text/plain")
  })

  it("404s rather than rendering a fallback card", async () => {
    getPublicUserProfile.mockResolvedValue(null)

    const response = await GET(request(), params())
    expect(response.headers.get("Content-Type")).not.toContain("image")
  })

  it("404s on a bundle with no username, however it got there", async () => {
    getPublicUserProfile.mockResolvedValue(bundle({ username: "" }))

    expect((await GET(request(), params())).status).toBe(404)
  })
})

describe("formats", () => {
  it("renders the story card at exactly 1080×1920", async () => {
    const response = await GET(request("?format=story"), params())
    const png = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG")
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("renders the link card at exactly 1200×630", async () => {
    const png = Buffer.from(await (await GET(request("?format=link"), params())).arrayBuffer())
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it("defaults to link — the crawler is the caller that cannot pass a param", async () => {
    const png = Buffer.from(await (await GET(request(), params())).arrayBuffer())
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })

  it("treats an unknown format as link rather than erroring", async () => {
    const png = Buffer.from(
      await (await GET(request("?format=poster"), params())).arrayBuffer()
    )
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
  })
})

describe("caching", () => {
  it("sets the hour-fresh, day-stale policy", async () => {
    const response = await GET(request("?format=story"), params())

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400"
    )
  })

  it("gives reordered slots ONE cache identity", async () => {
    const a = await GET(request("?format=story&slots=height,city,weight"), params())
    resetRateLimit()
    const b = await GET(request("?format=story&slots=weight,height,city"), params())

    expect(a.headers.get("ETag")).toBe(b.headers.get("ETag"))
  })

  it("gives a different slot set a different identity", async () => {
    const a = await GET(request("?format=story&slots=height,city,weight"), params())
    resetRateLimit()
    const b = await GET(request("?format=story&slots=height,city,joined"), params())

    expect(a.headers.get("ETag")).not.toBe(b.headers.get("ETag"))
  })

  it("changes identity when the profile is edited", async () => {
    const a = await GET(request("?format=story"), params())

    resetRateLimit()
    getPublicUserProfile.mockResolvedValue(bundle({ updated_at: "2026-08-05T10:00:00Z" }))
    const b = await GET(request("?format=story"), params())

    expect(a.headers.get("ETag")).not.toBe(b.headers.get("ETag"))
  })

  it("ignores slots on the link format — the crawler fetches it, not the player", async () => {
    const a = await GET(request("?format=link&slots=weight,joined,age_group"), params())
    resetRateLimit()
    const b = await GET(request("?format=link"), params())

    expect(a.headers.get("ETag")).toBe(b.headers.get("ETag"))
  })
})

/**
 * The QR.
 *
 * Two cards come out of this route now, and the cache has to be able to tell
 * them apart — a shared ETag would let a viewer who asked for no QR revalidate
 * their way into somebody else's cached card with one on it, and vice versa.
 * Everything that resolves to the SAME card must still share one identity.
 */
describe("the qr param", () => {
  async function etag(query: string) {
    const response = await GET(request(query), params())
    resetRateLimit()
    return response.headers.get("ETag")
  }

  it("gives the QR and no-QR story cards different identities", async () => {
    expect(await etag("?format=story")).not.toBe(await etag("?format=story&qr=0"))
  })

  it.each(["", "&qr=1", "&qr=", "&qr=true", "&qr=junk", "&qr=00"])(
    "treats `%s` as on — only the exact string \"0\" turns it off",
    async (suffix) => {
      // Same philosophy as parseFormat: a hand-edited query string gets the
      // default, never a 400. The caller on the other end of a broken image is
      // somebody's chat app.
      expect(await etag(`?format=story${suffix}`)).toBe(await etag("?format=story"))
    }
  )

  it("ignores the param entirely on the link card", async () => {
    // The link card is an OG preview: already clickable, so a QR on it is noise.
    // A `qr` somebody appended to it must not mint a second cache entry for a
    // card that renders identical bytes.
    const bare = await etag("?format=link")

    expect(await etag("?format=link&qr=0")).toBe(bare)
    expect(await etag("?format=link&qr=1")).toBe(bare)
  })

  it("still renders a story card at full size with the QR off", async () => {
    const png = Buffer.from(
      await (await GET(request("?format=story&qr=0"), params())).arrayBuffer()
    )
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 })
  })

  it("404s before it would build a QR target, for a profile that has no card", async () => {
    getPublicUserProfile.mockResolvedValue(null)

    const response = await GET(request("?format=story"), params())
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60")
  })
})

describe("rate limit", () => {
  it("throttles one IP after its budget and tells it when to come back", async () => {
    let last: Response | undefined
    for (let i = 0; i < 40; i++) {
      last = await GET(request("?format=link"), params())
      if (last.status === 429) break
    }

    expect(last?.status).toBe(429)
    expect(last?.headers.get("Retry-After")).toBe("60")
  })

  it("does not spend one caller's budget on another", async () => {
    for (let i = 0; i < 35; i++) await GET(request("?format=link", "198.51.100.7"), params())

    const other = await GET(request("?format=link", "203.0.113.9"), params())
    expect(other.status).toBe(200)
  })

  it("refuses before rendering, not after", async () => {
    for (let i = 0; i < 35; i++) await GET(request("?format=link"), params())

    const callsBefore = getPublicUserProfile.mock.calls.length
    await GET(request("?format=link"), params())

    // A throttled request must cost nothing — no backend round trip, no render.
    expect(getPublicUserProfile.mock.calls.length).toBe(callsBefore)
  })
})
