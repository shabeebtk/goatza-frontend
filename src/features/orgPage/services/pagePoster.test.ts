/**
 * The poster's words. The canvas itself isn't unit-tested; `posterLines` decides
 * every line it draws, so this is where the poster's content is pinned.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/profile/services/publicProfile.api", () => ({
  siteOrigin: () => "https://goatza.com",
}))

import { posterInitials, posterLines } from "./pagePoster"

const input = {
  orgName: "Thrissur Tigers Football Academy",
  username: "thrissur_tigers",
  logoUrl: null,
  primarySport: "Football",
  ageMin: 8,
  ageMax: 16,
  primaryCity: "Thrissur",
  enquiryFormOn: true,
}

beforeEach(() => vi.clearAllMocks())

describe("posterLines", () => {
  it("draws the name, the facts line, the enquiry headline and the vanity link", () => {
    const lines = posterLines(input)

    expect(lines.name).toBe("Thrissur Tigers Football Academy")
    expect(lines.facts).toBe("Football coaching · Ages 8 – 16 · Thrissur")
    expect(lines.headline).toEqual([
      { text: "WANT TO JOIN?", accent: false },
      { text: "SCAN TO ENQUIRE", accent: true },
    ])
    expect(lines.instruction).toBe("Point your phone camera at the code")
    expect(lines.qrText).toBe("https://goatza.com/thrissur_tigers")
    // Printed without the scheme.
    expect(lines.url).toBe("goatza.com/thrissur_tigers")
    expect(lines.wordmark).toBe("GOATZA")
  })

  it("asks people to see the page when the enquiry form is off", () => {
    expect(posterLines({ ...input, enquiryFormOn: false }).headline).toEqual([
      { text: "SCAN TO SEE OUR PAGE", accent: true },
    ])
  })

  it("skips any part of the facts line it doesn't have", () => {
    expect(posterLines({ ...input, primarySport: null }).facts).toBe("Ages 8 – 16 · Thrissur")
    expect(posterLines({ ...input, ageMin: null, ageMax: null }).facts).toBe("Football coaching · Thrissur")
    expect(posterLines({ ...input, primarySport: "", ageMin: null, ageMax: null, primaryCity: "" }).facts).toBe("")
  })

  it("has initials for the logo's fallback tile", () => {
    expect(posterInitials("Thrissur Tigers")).toBe("TT")
    expect(posterInitials("Kerala")).toBe("KE")
    expect(posterInitials("")).toBe("G")
  })
})
