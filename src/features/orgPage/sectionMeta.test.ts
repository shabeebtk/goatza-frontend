/**
 * The hub's section rows: their order by type, their status lines and what is
 * "empty". The fixtures are real page/admin answers from the backend (a fresh
 * academy, then one with programs, facilities, a hidden coach and Players off).
 */

import { describe, expect, it } from "vitest"

import { READINESS_STEPS, SECTION_META, sectionHasContent, sectionOrder, sectionStatusLine } from "./sectionMeta"
import type { PageSections, SectionKey } from "./types"
import { FILLED_SECTIONS, FRESH_SECTIONS } from "./__fixtures__/pageAdmin"

describe("sectionOrder", () => {
  it("puts programs and facilities first for an academy", () => {
    expect(sectionOrder("academy")).toEqual([
      "about", "programs", "facilities", "coaches", "players", "squads", "locations", "trials", "posts",
    ])
  })

  it("puts squads and trials first for a club and a team, and for a type it doesn't know", () => {
    const club = ["about", "squads", "trials", "coaches", "players", "programs", "facilities", "locations", "posts"]
    expect(sectionOrder("club")).toEqual(club)
    expect(sectionOrder("team")).toEqual(club)
    expect(sectionOrder("school")).toEqual(club)
  })
})

describe("The status lines", () => {
  const line = (key: SectionKey, sections: PageSections) => sectionStatusLine(key, sections)

  it("reads a fresh academy", () => {
    expect(line("about", FRESH_SECTIONS)).toBe("Not written yet")
    expect(line("programs", FRESH_SECTIONS)).toBe("Not added yet")
    expect(line("facilities", FRESH_SECTIONS)).toBe("Not added yet")
    expect(line("coaches", FRESH_SECTIONS)).toBe("Not added yet")
    expect(line("players", FRESH_SECTIONS)).toBe("Not picked yet")
    expect(line("squads", FRESH_SECTIONS)).toBe("No public squads yet")
    expect(line("locations", FRESH_SECTIONS)).toBe("1 branch")
    expect(line("trials", FRESH_SECTIONS)).toBe("None open right now")
    expect(line("posts", FRESH_SECTIONS)).toBe("Always shown")
  })

  it("counts what is there, plural only past one, and drops a zero part", () => {
    expect(line("about", FILLED_SECTIONS)).toBe("Complete")
    expect(line("programs", FILLED_SECTIONS)).toBe("2 programs")
    expect(line("facilities", FILLED_SECTIONS)).toBe("4 facilities · 1 photo")
    expect(line("coaches", FILLED_SECTIONS)).toBe("1 shown")

    const more: PageSections = {
      ...FILLED_SECTIONS,
      programs: { enabled: true, switchable: true, count: 1 },
      facilities: { enabled: true, switchable: true, items: 0, photos: 3 },
      squads: { enabled: true, switchable: true, count: 2 },
      locations: { enabled: true, switchable: true, count: 3 },
      trials: { enabled: true, switchable: true, count: 1 },
    }
    expect(line("programs", more)).toBe("1 program")
    expect(line("facilities", more)).toBe("3 photos")
    expect(line("squads", more)).toBe("2 squads · managed in Squads")
    expect(line("locations", more)).toBe("3 branches")
    expect(line("trials", more)).toBe("1 open")
  })
})

describe("sectionHasContent", () => {
  it("is what decides between the switch and the Add pill", () => {
    expect(sectionHasContent("about", FRESH_SECTIONS)).toBe(false)
    expect(sectionHasContent("about", FILLED_SECTIONS)).toBe(true)
    expect(sectionHasContent("facilities", FILLED_SECTIONS)).toBe(true)
    expect(sectionHasContent("locations", FRESH_SECTIONS)).toBe(true)
    // A hidden coach isn't counted, so a page with only that one is "empty".
    expect(sectionHasContent("coaches", { ...FRESH_SECTIONS })).toBe(false)
  })
})

describe("Where each row and each next step goes", () => {
  it("opens the editor, or the screen that owns the section", () => {
    const base = "/organization/admin/org-1"
    expect(SECTION_META.coaches.href("org-1")).toBe(`${base}/page/people`)
    expect(SECTION_META.players.href("org-1")).toBe(`${base}/page/people?tab=players`)
    expect(SECTION_META.squads.href("org-1")).toBe(`${base}/squads`)
    expect(SECTION_META.locations.href("org-1")).toBe(`${base}/profile?edit=profile`)
    expect(SECTION_META.trials.href("org-1")).toBe(`${base}/recruitments`)
  })

  it("sends key facts to the facts anchor and photos to the profile's photo editor", () => {
    expect(READINESS_STEPS.facts.href("org-1")).toBe("/organization/admin/org-1/page/about#facts")
    expect(READINESS_STEPS.photos.href("org-1")).toBe("/organization/admin/org-1/profile?edit=photos")
    expect(READINESS_STEPS.about.why("club")).toBe("A few lines about your club help people decide.")
  })
})
