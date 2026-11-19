/**
 * The page's section rules with no React in them: the order this build draws,
 * where Sports goes, the quick facts, and the small lines the sections share.
 */

import { describe, expect, it } from "vitest"

import { ACADEMY_PAGE, LOCATIONS } from "./__fixtures__/pageShowcase"
import {
  aboutHasContent,
  bodySlots,
  directionsUrl,
  knownOrder,
  playerLine,
  playerNote,
  quickFactRows,
  renderedSections,
} from "./profileSections"

describe("knownOrder", () => {
  it("drops unknown keys and repeats, and keeps posts last", () => {
    expect(knownOrder(["posts", "about", "gallery", "about", "trials"])).toEqual(["about", "trials", "posts"])
    expect(knownOrder(undefined)).toEqual(["posts"])
  })
})

describe("bodySlots", () => {
  const order = knownOrder(ACADEMY_PAGE.order)

  it("puts Sports right after the about slot, even when About draws nothing", () => {
    expect(bodySlots(order, ["about", "programs", "posts"], true)).toEqual(["about", "sports", "programs", "posts"])
    expect(bodySlots(order, ["programs", "posts"], true)).toEqual(["sports", "programs", "posts"])
  })

  it("puts Sports first when About is switched off, and nowhere without sports", () => {
    const noAbout = order.filter((key) => key !== "about")
    expect(bodySlots(noAbout, ["programs", "posts"], true)).toEqual(["sports", "programs", "posts"])
    expect(bodySlots(order, ["about", "posts"], false)).toEqual(["about", "posts"])
  })

  it("keeps only what renders, in order", () => {
    const presence = { about: true, programs: false, facilities: true, coaches: false, players: false, squads: false, locations: true, trials: false, posts: true }
    expect(renderedSections(order, presence)).toEqual(["about", "facilities", "locations", "posts"])
  })
})

describe("quick facts", () => {
  it("lists Founded, Ages, Students and Training days, each only when filled", () => {
    expect(quickFactRows(ACADEMY_PAGE.facts).map((row) => [row.label, row.value])).toEqual([
      ["Founded", "2012"],
      ["Ages", "6 – 18"],
      ["Students", "100–200"],
      ["Training days", "Tue · Thu · Sat"],
    ])
    expect(quickFactRows(null)).toEqual([])
  })

  it("lets About count as empty when its facts have moved to the aside", () => {
    const facts = { ...ACADEMY_PAGE.facts!, coaching_languages: [], links: { instagram: null, youtube: null, facebook: null } }
    const base = { orgName: "Kannur FA", description: "", website: "", level: "", facts }

    expect(aboutHasContent(base)).toBe(true)
    expect(aboutHasContent({ ...base, omitFacts: ["founded", "ages", "students", "days"] })).toBe(false)
  })
})

describe("the small lines", () => {
  it("gives directions to the pin, else the address with its city", () => {
    expect(directionsUrl(LOCATIONS[0])).toBe("https://www.google.com/maps/search/?api=1&query=11.87,75.37")
    expect(directionsUrl(LOCATIONS[1])).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Stadium Road, Kannur")}`
    )
    expect(directionsUrl({ ...LOCATIONS[1], address: "" })).toBeNull()
  })

  it("reads a player's line and note", () => {
    expect(playerLine({ position: "Goalkeeper", years_label: "2019 – 2023" })).toBe("Goalkeeper · here 2019 – 2023")
    expect(playerLine({ position: null, years_label: "" })).toBe("")
    expect(playerNote({ now_at: "Gokulam Kerala", highlight: "Captain" })).toBe("Now at Gokulam Kerala")
    expect(playerNote({ now_at: null, highlight: "Captain" })).toBe("Captain")
  })
})
