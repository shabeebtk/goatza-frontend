/**
 * The consent-token scrubber.
 *
 * Worth pinning because the failure is silent and one-way: nothing looks wrong
 * if this stops working, and by the time anyone notices, live consent links for
 * named children are already sitting in a third party's error store. The tests
 * below are mostly negative — what must NOT come out the other side.
 */

import { describe, expect, it } from "vitest"

import { redactSecretPaths, scrubBreadcrumb, scrubEvent } from "./redact"

const TOKEN = "9f2c1a4e8b7d6350aa11bb22cc33dd44"

// The shape a real token has — `secrets.token_urlsafe(32)` on the server:
// 43 chars of base64url, letters of both cases, dashes and underscores. The
// first version of this scrubber built its character class in a template
// literal with a lone `\s`, which cooks to the letter s, so a token like this
// one kept everything after its first s. Kept as a second fixture so that
// regression fails here rather than in Sentry.
const REAL_TOKEN = "5V1jT6kOhF3L0kSd7ogmllU7VAcNI1LmXm0xvXhr--Q"

describe("redactSecretPaths", () => {
  it("removes the token from a consent URL", () => {
    const result = redactSecretPaths(`https://goatza.com/guardian/${TOKEN}`)

    expect(result).not.toContain(TOKEN)
    expect(result).toBe("https://goatza.com/guardian/[redacted]")
  })

  it("removes the whole token, whatever letters it contains", () => {
    const result = redactSecretPaths(`/guardian/${REAL_TOKEN}`)

    expect(result).toBe("/guardian/[redacted]")
    expect(result).not.toContain("Sd7ogm")
  })

  it("keeps the query string but not the token", () => {
    const result = redactSecretPaths(
      `https://goatza.com/guardian/${TOKEN}?from=email`,
    )

    expect(result).not.toContain(TOKEN)
    expect(result).toContain("?from=email")
  })

  it("handles a relative path, which is what breadcrumbs carry", () => {
    expect(redactSecretPaths(`/guardian/${TOKEN}`)).toBe("/guardian/[redacted]")
  })

  it("scrubs a token buried in a sentence", () => {
    const result = redactSecretPaths(
      `Failed to fetch /guardian/${TOKEN}/approve after 3 retries`,
    )

    expect(result).not.toContain(TOKEN)
    expect(result).toContain("after 3 retries")
  })

  it("scrubs every occurrence, not just the first", () => {
    const result = redactSecretPaths(
      `/guardian/${TOKEN} then /guardian/${TOKEN}`,
    )

    expect(result).not.toContain(TOKEN)
  })

  // The waiting screen lives at /auth/guardian/waiting and is not a secret —
  // but it does sit under a `guardian` segment, so it gets scrubbed too. That
  // is the safe direction to be wrong in, and this pins it as deliberate.
  it("also scrubs the non-secret guardian route, which is the safe default", () => {
    expect(redactSecretPaths("/auth/guardian/waiting")).toBe(
      "/auth/guardian/[redacted]",
    )
  })

  /*
    The API calls the consent page makes. `consent` is a fixed segment and
    stays — it is what tells a fetch breadcrumb apart from a page view — and
    the token after it goes. The first version of this rule ate `consent` and
    left the token standing.
  */
  it("redacts the token in an API call and keeps the word consent", () => {
    expect(
      redactSecretPaths(`https://api.goatza.com/api/guardian/consent/${TOKEN}/approve`),
    ).toBe("https://api.goatza.com/api/guardian/consent/[redacted]/approve")
  })

  it("does the same for the page read, the decline and the withdraw", () => {
    for (const suffix of ["", "/decline", "/withdraw"]) {
      const result = redactSecretPaths(`/api/guardian/consent/${REAL_TOKEN}${suffix}`)

      expect(result).toBe(`/api/guardian/consent/[redacted]${suffix}`)
    }
  })

  /*
    The very first consent emails carried the token as `?token=`. Those links
    404 now, but an old one opened from an inbox still lands on a page that
    reports to Sentry with that URL.
  */
  it("redacts a token= query value", () => {
    const result = redactSecretPaths(
      `https://goatza.com/guardian-consent?token=${REAL_TOKEN}`,
    )

    expect(result).not.toContain(REAL_TOKEN)
    expect(result).toBe("https://goatza.com/guardian-consent?token=[redacted]")
  })

  it("redacts token= wherever it sits in the query, and only that value", () => {
    const result = redactSecretPaths(
      `/guardian-consent?from=email&token=${TOKEN}&utm=x#top`,
    )

    expect(result).not.toContain(TOKEN)
    expect(result).toBe("/guardian-consent?from=email&token=[redacted]&utm=x#top")
  })

  it("leaves unrelated URLs alone", () => {
    const url = "https://goatza.com/profile/ronaldo?tab=posts"
    expect(redactSecretPaths(url)).toBe(url)
  })

  it("passes non-strings straight through", () => {
    expect(redactSecretPaths(undefined)).toBeUndefined()
    expect(redactSecretPaths(42)).toBe(42)
  })
})

describe("scrubBreadcrumb", () => {
  it("cleans a fetch breadcrumb's url", () => {
    const crumb = scrubBreadcrumb({
      data: { url: `/guardian/${TOKEN}/approve`, method: "POST" },
    })

    expect(crumb.data?.url).not.toContain(TOKEN)
    expect(crumb.data?.method).toBe("POST")
  })

  it("cleans the API call the consent page actually makes", () => {
    const crumb = scrubBreadcrumb({
      data: {
        url: `https://api.goatza.com/api/guardian/consent/${REAL_TOKEN}/approve`,
        method: "POST",
      },
    })

    expect(crumb.data?.url).toBe(
      "https://api.goatza.com/api/guardian/consent/[redacted]/approve",
    )
  })

  it("cleans both ends of a navigation breadcrumb", () => {
    const crumb = scrubBreadcrumb({
      data: { from: `/guardian/${TOKEN}`, to: "/report-problem" },
    })

    expect(crumb.data?.from).not.toContain(TOKEN)
    expect(crumb.data?.to).toBe("/report-problem")
  })

  it("cleans the message", () => {
    const crumb = scrubBreadcrumb({ message: `GET /guardian/${TOKEN} → 500` })

    expect(crumb.message).not.toContain(TOKEN)
  })
})

describe("scrubEvent", () => {
  it("cleans the request url, the referer and every breadcrumb", () => {
    const event = scrubEvent({
      request: {
        url: `https://goatza.com/guardian/${TOKEN}`,
        headers: { Referer: `https://goatza.com/guardian/${TOKEN}` },
      },
      transaction: "/guardian/[token]",
      breadcrumbs: [
        { data: { url: `/guardian/${TOKEN}` } },
        { data: { url: `/api/guardian/consent/${REAL_TOKEN}` } },
        { message: `navigated to /guardian-consent?token=${REAL_TOKEN}` },
      ],
    })

    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain(TOKEN)
    expect(serialized).not.toContain(REAL_TOKEN)
  })

  it("survives an event with none of those fields", () => {
    expect(() => scrubEvent({})).not.toThrow()
  })
})
