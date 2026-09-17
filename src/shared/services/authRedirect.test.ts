/**
 * The `?next=` contract — the open-redirect guard and the places it feeds.
 *
 * `safeNextPath` is the ONE place a `next` value is ever read, so this file is
 * where the whole security posture is pinned. Two claims matter most:
 *
 *   1. Nothing that leaves the origin gets through, however it is spelled —
 *      a scheme, `//host`, a backslash, a `..` that would normalise past the
 *      blocklist.
 *   2. The blocklist matches on SEGMENT boundaries. `/authentic`, `/apiary`,
 *      `/joiner` and `/cardinal` are vanity profiles (app/[username]), and a
 *      raw `startsWith` would have quietly sent every one of those users to
 *      /home after login with no error anywhere.
 *
 * The three callers (`authUrlWithNext`, `postAuthPath`, the OAuth stash) are
 * covered for the same reason the helper is: a null from the guard has to
 * become `/home` — or no param, or no stash — in every one of them, and that
 * is a contract each caller keeps separately.
 *
 * Node environment: the OAuth stash tests hand the module a fake
 * sessionStorage on a stubbed `window`, which is all it touches.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  authUrlWithNext,
  BLOCKED_NEXT_PREFIXES,
  DEFAULT_POST_AUTH_PATH,
  postAuthPath,
  rememberOAuthNext,
  safeNextPath,
  takeOAuthNext,
} from "./authRedirect"

const UUID = "7f6b3c8a-2d1e-4f5a-9b0c-1d2e3f4a5b6c"

describe("safeNextPath", () => {
  it.each([
    "/home",
    "/profile/riya",
    `/recruitments/${UUID}`,
    "/profile/riya/network?tab=following",
    "/settings/cv",
    `/organization/admin/${UUID}/verifications?tab=achievements`,
  ])("accepts %s unchanged", (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  // Vanity usernames that merely START with a blocked word. app/[username]
  // catches these as profiles; blocking them would be a silent /home for a
  // real person.
  it.each(["/authentic", "/apiary", "/joiner", "/cardinal", "/guardians_fc"])(
    "accepts %s — a blocked word is only blocked as a whole segment",
    (path) => {
      expect(safeNextPath(path)).toBe(path)
    }
  )

  it("trims surrounding whitespace but is otherwise verbatim", () => {
    expect(safeNextPath("  /home  ")).toBe("/home")
  })

  it.each([
    { value: "https://evil.example", why: "absolute URL" },
    { value: "//evil.example", why: "protocol-relative" },
    { value: "/\\evil.example", why: "backslash after the slash" },
    { value: "javascript:alert(1)", why: "scheme" },
    { value: "", why: "empty" },
    { value: null, why: "null" },
    { value: undefined, why: "undefined" },
  ])("rejects $value ($why)", ({ value }) => {
    expect(safeNextPath(value)).toBeNull()
  })

  it.each([
    { value: "/auth", why: "the flow itself" },
    { value: "/auth/google/callback", why: "a step inside the flow" },
    { value: "/AUTH", why: "case must not matter" },
    { value: "/api/user/details", why: "the Django rewrite" },
    { value: "/guardian/sometoken", why: "the parent's consent page" },
    { value: "/card/profile/riya", why: "an image route handler" },
    { value: "/_next/static/x", why: "build output" },
    { value: "/_vercel/insights", why: "framework-owned" },
    { value: "/join", why: "the waitlist" },
    { value: "/", why: "bare root" },
    { value: "/?utm=x", why: "bare root with a query" },
    { value: "/manifest.json", why: "a dot in a segment" },
    { value: "/icons/x.svg", why: "a dot in a nested segment" },
    { value: "/x/../auth", why: "dot-segment that normalises into the blocklist" },
    { value: "/foo\\bar", why: "a backslash anywhere" },
    { value: "/home\nx", why: "a control character" },
    { value: "/home\u007f", why: "DEL" },
  ])("rejects $value ($why)", ({ value }) => {
    expect(safeNextPath(value)).toBeNull()
  })

  it("rejects a path over 512 characters", () => {
    expect(safeNextPath(`/${"a".repeat(600)}`)).toBeNull()
    // The cap is on the whole value; a legitimately long query still fits.
    expect(safeNextPath(`/${"a".repeat(511)}`)).not.toBeNull()
  })

  it("only inspects the PATH for dots and blocked words", () => {
    // Dots and blocked words in the query string are data, not a destination.
    expect(safeNextPath("/home?v=1.2&from=/auth")).toBe("/home?v=1.2&from=/auth")
    expect(safeNextPath("/home#section.one")).toBe("/home#section.one")
  })

  it("blocks every listed prefix, with and without a trailing segment", () => {
    for (const prefix of BLOCKED_NEXT_PREFIXES) {
      expect(safeNextPath(prefix)).toBeNull()
      expect(safeNextPath(`${prefix}/`)).toBeNull()
      expect(safeNextPath(`${prefix}/anything`)).toBeNull()
      expect(safeNextPath(`${prefix}?x=1`)).toBeNull()
    }
  })
})

describe("authUrlWithNext", () => {
  it("is a plain /auth when there is no value", () => {
    expect(authUrlWithNext(null)).toBe("/auth")
    expect(authUrlWithNext(undefined)).toBe("/auth")
    expect(authUrlWithNext("")).toBe("/auth")
  })

  it("is a plain /auth when the value is blocked or unsafe", () => {
    expect(authUrlWithNext("/auth/select-role")).toBe("/auth")
    expect(authUrlWithNext("https://evil.example")).toBe("/auth")
    expect(authUrlWithNext("/manifest.json")).toBe("/auth")
  })

  it("adds mode=signup only for signup", () => {
    expect(authUrlWithNext("/home", "signup")).toBe("/auth?mode=signup&next=%2Fhome")
    expect(authUrlWithNext("/home", "login")).toBe("/auth?next=%2Fhome")
    expect(authUrlWithNext(null, "signup")).toBe("/auth?mode=signup")
  })

  it("percent-encodes a path that carries its own query string", () => {
    const url = authUrlWithNext("/profile/riya/network?tab=following&page=2")

    // Encoded on the wire, so the inner `&` cannot split the outer query …
    expect(url).toBe(
      "/auth?next=%2Fprofile%2Friya%2Fnetwork%3Ftab%3Dfollowing%26page%3D2"
    )
    // … and comes back whole when the auth page reads it.
    const params = new URL(url, "http://localhost").searchParams
    expect(params.get("next")).toBe("/profile/riya/network?tab=following&page=2")
  })
})

describe("postAuthPath", () => {
  it("is /home when there is no next", () => {
    expect(postAuthPath(new URLSearchParams(""))).toBe(DEFAULT_POST_AUTH_PATH)
    expect(postAuthPath(null)).toBe(DEFAULT_POST_AUTH_PATH)
    expect(postAuthPath(undefined)).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it("is /home when next is blocked or unsafe", () => {
    expect(postAuthPath(new URLSearchParams("next=/auth"))).toBe("/home")
    expect(postAuthPath(new URLSearchParams("next=//evil.example"))).toBe("/home")
    expect(postAuthPath(new URLSearchParams("next=/api/user/details"))).toBe("/home")
  })

  it("is the path when next is valid", () => {
    expect(postAuthPath(new URLSearchParams("next=%2Fprofile%2Friya"))).toBe(
      "/profile/riya"
    )
    expect(
      postAuthPath(new URLSearchParams("next=%2Fsettings%2Fcv%3Ftab%3Dx"))
    ).toBe("/settings/cv?tab=x")
  })
})

describe("OAuth stash", () => {
  // A minimal sessionStorage: the module only ever calls these three.
  function stubStorage(overrides: Partial<Storage> = {}) {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      ...overrides,
    }
    vi.stubGlobal("window", { sessionStorage: storage })
    return store
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("round-trips a valid path, exactly once", () => {
    stubStorage()

    rememberOAuthNext("/profile/riya?tab=posts")

    expect(takeOAuthNext()).toBe("/profile/riya?tab=posts")
    // Single use: the second read is the default, not a stale destination.
    expect(takeOAuthNext()).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it("does not store a blocked value, and clears whatever was there", () => {
    const store = stubStorage()

    rememberOAuthNext("/profile/riya")
    rememberOAuthNext("/auth/google/callback")

    expect(store.size).toBe(0)
    expect(takeOAuthNext()).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it("does not store an off-origin value", () => {
    const store = stubStorage()

    rememberOAuthNext("https://evil.example")

    expect(store.size).toBe(0)
  })

  it("never throws when storage is unavailable", () => {
    const boom = () => {
      throw new Error("SecurityError")
    }
    stubStorage({ getItem: boom, setItem: boom, removeItem: boom })

    expect(() => rememberOAuthNext("/home")).not.toThrow()
    expect(takeOAuthNext()).toBe(DEFAULT_POST_AUTH_PATH)
  })

  it("is inert without a window", () => {
    vi.stubGlobal("window", undefined)

    expect(() => rememberOAuthNext("/home")).not.toThrow()
    expect(takeOAuthNext()).toBe(DEFAULT_POST_AUTH_PATH)
  })
})
