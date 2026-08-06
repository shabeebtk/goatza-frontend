/**
 * URL resolution for the public API, and the not-found / unavailable split.
 *
 * These exist because of a production incident: with `NEXT_PUBLIC_API_URL=/api`
 * (the Vercel rewrite) and `NEXT_PUBLIC_SITE_URL` unset, the server-side base
 * URL resolved to the bare string "/api". `fetch("/api/…")` on the server throws
 * — a relative URL is not a URL there — the throw was swallowed into a null
 * bundle, and the page turned that into notFound(). Every profile on the site
 * 404'd, including for signed-in users, with nothing in the logs.
 *
 * Localhost never saw it because NEXT_PUBLIC_API_URL is absolute in dev, so the
 * broken branch was never taken.
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

/** Reload the module so it re-reads process.env at import time. */
async function load() {
  vi.resetModules()
  return import("./publicProfile.api")
}

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const key of ENV_KEYS) delete process.env[key]
  vi.stubGlobal("fetch", vi.fn())
  // Node has no `window`; be explicit, because the browser branch of apiBase()
  // is exactly what these tests must NOT take.
  vi.stubGlobal("window", undefined)
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.unstubAllGlobals()
})

/** The URL the module actually fetched. */
function fetchedUrl(): string {
  const mock = fetch as unknown as ReturnType<typeof vi.fn>
  return mock.mock.calls[0]?.[0] as string
}

function okResponse(data: unknown = { profile: {} }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  }
}

describe("server-side API base URL", () => {
  it("never issues a relative request from the server", async () => {
    // The exact production configuration that broke.
    process.env.NEXT_PUBLIC_API_URL = "/api"
    process.env.NEXT_PUBLIC_SITE_URL = "https://goatza.com"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(okResponse())

    const api = await load()
    await api.getPublicUserProfile("rahul7")

    expect(fetchedUrl()).toMatch(/^https:\/\//)
    expect(fetchedUrl()).toBe(
      "https://goatza.com/api/public/profile/rahul7"
    )
  })

  it("prefers API_ORIGIN, going straight at Django", async () => {
    process.env.NEXT_PUBLIC_API_URL = "/api"
    process.env.NEXT_PUBLIC_SITE_URL = "https://goatza.com"
    process.env.API_ORIGIN = "https://goatza-backend.onrender.com"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(okResponse())

    const api = await load()
    await api.getPublicUserProfile("rahul7")

    // No "/api" — that prefix belongs to the rewrite, not to Django.
    expect(fetchedUrl()).toBe(
      "https://goatza-backend.onrender.com/public/profile/rahul7"
    )
  })

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when SITE_URL is unset", async () => {
    // The incident's configuration: nobody set NEXT_PUBLIC_SITE_URL in the
    // dashboard. A deploy must still work.
    process.env.NEXT_PUBLIC_API_URL = "/api"
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "goatza.com"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(okResponse())

    const api = await load()
    await api.getPublicUserProfile("rahul7")

    expect(fetchedUrl()).toBe("https://goatza.com/api/public/profile/rahul7")
  })

  it("uses an absolute NEXT_PUBLIC_API_URL as-is (local dev)", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(okResponse())

    const api = await load()
    await api.getPublicUserProfile("rahul7")

    expect(fetchedUrl()).toBe("http://localhost:8000/public/profile/rahul7")
  })

  it("strips a trailing slash — /api/…/ 404s in production only", async () => {
    process.env.NEXT_PUBLIC_API_URL = "/api/"
    process.env.NEXT_PUBLIC_SITE_URL = "https://goatza.com/"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue(okResponse())

    const api = await load()
    await api.getPublicUserProfile("rahul7")

    expect(fetchedUrl()).toBe("https://goatza.com/api/public/profile/rahul7")
  })
})

describe("siteOrigin", () => {
  it("prefers the explicit value", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://goatza.com"
    process.env.VERCEL_URL = "some-deploy-xyz.vercel.app"

    const api = await load()
    expect(api.siteOrigin()).toBe("https://goatza.com")
  })

  it("prefers the stable production domain over the per-deploy hostname", async () => {
    // A canonical URL must not be a preview hostname.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "goatza.com"
    process.env.VERCEL_URL = "some-deploy-xyz.vercel.app"

    const api = await load()
    expect(api.siteOrigin()).toBe("https://goatza.com")
  })
})

describe("not found vs unavailable", () => {
  it("reports a 404 as not_found", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({ ok: false, status: 404 })

    const api = await load()
    const result = await api.getPublicUserProfileResult("hidden")

    expect(result.status).toBe("not_found")
  })

  it("reports a 500 as unavailable, NOT as not_found", async () => {
    // The distinction the page depends on: an API problem must not read as
    // "this profile does not exist".
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({ ok: false, status: 500 })

    const api = await load()
    const result = await api.getPublicUserProfileResult("rahul7")

    expect(result.status).toBe("unavailable")
  })

  it("reports a thrown fetch as unavailable", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"

    const mock = fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockRejectedValue(new TypeError("Failed to parse URL"))

    const api = await load()
    const result = await api.getPublicUserProfileResult("rahul7")

    expect(result.status).toBe("unavailable")
  })

  it("reports a missing base URL as unavailable without fetching", async () => {
    // Nothing configured at all. The old code returned null here, which the
    // page rendered as a hard 404.
    const mock = fetch as unknown as ReturnType<typeof vi.fn>

    const api = await load()
    const result = await api.getPublicUserProfileResult("rahul7")

    expect(result.status).toBe("unavailable")
    expect(mock).not.toHaveBeenCalled()
  })
})
