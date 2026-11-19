/**
 * The org profile's link-preview description: the page's parts joined, the
 * missing ones skipped, cut to 160 at a word; with no page, what it always was.
 */

import { describe, expect, it } from "vitest"

import { ACADEMY_PAGE } from "./__fixtures__/pageShowcase"
import { cutAtWord, legacyMetaDescription, profileMetaDescription } from "./pageMeta"

const PROFILE = {
  headline: "",
  type: "academy",
  sports: [{ id: "s-1", name: "Football", icon_name: "", icon_url: "", is_primary: true }],
  locations: [
    {
      id: "loc-1",
      name: "Thana Turf",
      address: "",
      city: "Kannur",
      state: "Kerala",
      country_code: "IN",
      latitude: null,
      longitude: null,
      is_primary: true,
    },
  ],
}

describe("profileMetaDescription", () => {
  it("joins the identity line, ages, programs and the form", () => {
    expect(profileMetaDescription(PROFILE, ACADEMY_PAGE)).toBe(
      "Academy · Football · Kannur · Ages 6 – 18 · 2 programs · Enquire on Goatza"
    )
  })

  it("leads with the headline when there is one, and skips what is missing", () => {
    const page = { ...ACADEMY_PAGE, facts: null, programs: [], contact: { ...ACADEMY_PAGE.contact, enquiry_form: false } }
    expect(profileMetaDescription({ ...PROFILE, headline: "Where Kannur learns football" }, page)).toBe(
      "Where Kannur learns football"
    )
  })

  it("is the old description without a page", () => {
    expect(profileMetaDescription(PROFILE, null)).toBe("Academy · Football · Kannur on Goatza")
    expect(legacyMetaDescription({ ...PROFILE, headline: "Our line" })).toBe("Our line")
  })

  it("is cut to 160 characters at a word boundary", () => {
    const long = { ...PROFILE, headline: "Football coaching for every age ".repeat(8).trim() }
    const description = profileMetaDescription(long, ACADEMY_PAGE)

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description.endsWith("…")).toBe(true)
    // The word before the ellipsis is whole.
    expect("Football coaching for every age".split(" ")).toContain(description.slice(0, -1).split(" ").pop())
  })
})

describe("cutAtWord", () => {
  it("leaves short text alone and never ends on a separator", () => {
    expect(cutAtWord("Short")).toBe("Short")
    expect(cutAtWord("aaaa · bbbb · cccc", 12)).toBe("aaaa · bbbb…")
    expect(cutAtWord("aaaa · bbbb", 9)).toBe("aaaa…")
  })
})
