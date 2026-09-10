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

describe("redactSecretPaths", () => {
  it("removes the token from a consent URL", () => {
    const result = redactSecretPaths(`https://goatza.com/guardian/${TOKEN}`)

    expect(result).not.toContain(TOKEN)
    expect(result).toBe("https://goatza.com/guardian/[redacted]")
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
        { message: `navigated to /guardian/${TOKEN}` },
      ],
    })

    expect(JSON.stringify(event)).not.toContain(TOKEN)
  })

  it("survives an event with none of those fields", () => {
    expect(() => scrubEvent({})).not.toThrow()
  })
})
