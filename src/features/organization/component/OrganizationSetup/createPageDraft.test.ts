import { describe, expect, it } from "vitest"

import {
  EMPTY_DRAFT,
  buildCreatePayload,
  firstIncompleteStep,
  isDraftDirty,
  normalizeWebsite,
  toHandle,
  validateStep,
  validateWebsite,
  type CreateDraft,
} from "./createPageDraft"

const draft = (patch: Partial<CreateDraft>): CreateDraft => ({ ...EMPTY_DRAFT, ...patch })

describe("toHandle", () => {
  it("turns a name into a page link", () => {
    expect(toHandle("Kannur FC Academy")).toBe("kannur_fc_academy")
    expect(toHandle("  St. Joseph's  Sports-Club ")).toBe("st_josephs_sports_club")
    expect(toHandle("Café Real")).toBe("cafe_real")
    expect(toHandle("__Kochi__United__")).toBe("kochi_united")
  })

  it("stays within 30 characters and never ends on an underscore", () => {
    const handle = toHandle("Kerala Blasters Football Club Youth Academy")
    expect(handle.length).toBeLessThanOrEqual(30)
    expect(handle.endsWith("_")).toBe(false)
  })
})

describe("website", () => {
  it("adds https:// when no scheme was typed", () => {
    expect(normalizeWebsite("kannurfc.in")).toBe("https://kannurfc.in")
    expect(normalizeWebsite("http://kannurfc.in")).toBe("http://kannurfc.in")
    expect(normalizeWebsite("  ")).toBe("")
  })

  it("accepts a web address and refuses anything else", () => {
    expect(validateWebsite("")).toBeNull()
    expect(validateWebsite("kannurfc.in/about")).toBeNull()
    expect(validateWebsite("not a site")).not.toBeNull()
    expect(validateWebsite("https://localhost")).not.toBeNull()
    expect(validateWebsite("ftp://kannurfc.in")).not.toBeNull()
  })

  // Each of these passes the browser's URL parser and was a 400 from the
  // server's URLField after the Review.
  it("refuses what the server would refuse", () => {
    expect(validateWebsite("my_club.com")).not.toBeNull()
    expect(validateWebsite("club.c")).not.toBeNull()
    expect(validateWebsite("club.123")).not.toBeNull()
    expect(validateWebsite("-club.com")).not.toBeNull()
  })

  it("still takes ordinary addresses, hyphens, subdomains and non-Latin hosts", () => {
    expect(validateWebsite("kannur-fc.co.in")).toBeNull()
    expect(validateWebsite("https://www.instagram.com/kannurfc/?hl=en")).toBeNull()
    expect(validateWebsite("കണ്ണൂർ.in")).toBeNull()
  })

  it("sends spaces in a pasted link as %20, so the server takes it", () => {
    expect(validateWebsite("fb.com/Kannur FC Academy")).toBeNull()
    const payload = buildCreatePayload({
      ...EMPTY_DRAFT,
      type: "club",
      name: "Kannur FC",
      website: "fb.com/Kannur FC Academy",
    })
    expect(payload.website).toBe("https://fb.com/Kannur%20FC%20Academy")
  })
})

describe("steps", () => {
  it("finds the first step that still needs something", () => {
    expect(firstIncompleteStep(EMPTY_DRAFT)).toBe("type")
    expect(firstIncompleteStep(draft({ type: "club" }))).toBe("basics")
    expect(
      firstIncompleteStep(draft({ type: "club", name: "Kannur FC", username: "kannur_fc" }))
    ).toBeNull()
  })

  it("checks the basics with the shared handle rules", () => {
    const errors = validateStep("basics", draft({ name: "K", username: "kannur.fc" }))
    expect(errors.name).toBe("Name must be at least 2 characters")
    expect(errors.username).toBe("Only letters, numbers, and underscores allowed")
  })

  it("a default branch name alone is not something to lose", () => {
    expect(isDraftDirty(EMPTY_DRAFT)).toBe(false)
    expect(isDraftDirty(draft({ type: "team" }))).toBe(true)
  })
})

describe("buildCreatePayload", () => {
  it("sends the chosen handle, sports in pick order and the branch", () => {
    const payload = buildCreatePayload(
      draft({
        type: "academy",
        name: "  Kochi Academy ",
        username: "Kochi_Academy",
        website: "kochiacademy.in",
        level: "youth",
        sportIds: ["s-2", "s-1"],
        branchName: "",
        address: " Near the stadium ",
        city: {
          provider: "google",
          place_type: "city",
          label: "Kochi, Kerala, India",
          name: "Kochi",
          city: "Kochi",
          state: "Kerala",
          country: "India",
          country_code: "IN",
          latitude: 9.93,
          longitude: 76.26,
          external_id: "place-kochi",
          types: [],
        } as unknown as CreateDraft["city"],
      })
    )

    expect(payload).toMatchObject({
      name: "Kochi Academy",
      type: "academy",
      username: "kochi_academy",
      website: "https://kochiacademy.in",
      level: "youth",
      sport_ids: ["s-2", "s-1"],
      location: {
        name: "Main Branch",
        address: "Near the stadium",
        city: "Kochi",
        external_id: "place-kochi",
        location_name: "Kochi, Kerala, India",
      },
    })
    expect(payload).not.toHaveProperty("headline")
    expect(payload).not.toHaveProperty("description")
  })
})
