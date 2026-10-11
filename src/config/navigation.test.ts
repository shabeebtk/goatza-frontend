/**
 * The nav config's selectors — the contract three surfaces depend on.
 *
 * These are pure functions over a literal, so the tests are really about the
 * DATA staying the shape each surface expects. The ones that matter most are
 * the negative assertions: the bottom bar holding exactly five tabs, and the
 * "sheet" items never leaking into it, is what keeps a sixth tab from
 * silently appearing on a phone the next time someone adds a destination.
 */

import { describe, expect, it } from "vitest"

import {
  getBottomNav,
  getDesktopMore,
  getDesktopPrimary,
  getDesktopRight,
  getNavItems,
  getSheetFooter,
  getSheetSections,
  getTopBarNav,
  NAV_CONFIG,
} from "./navigation"
import type { UserRole } from "@/shared/constants/roles"

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

/** The config for a role, with the null-while-resolving case asserted away. */
function itemsFor(role: UserRole) {
  const items = getNavItems(role)
  expect(items).not.toBeNull()
  return items!
}

const ROLES: UserRole[] = ["player", "coach", "scout", "org_user"]

/** The destination that differs per role: Recruitments / Coaching / Scouting. */
const ROLE_DESTINATION: Record<UserRole, string> = {
  player: "recruitments",
  coach: "coaching",
  scout: "scouting",
  org_user: "recruitments",
}

describe("getNavItems", () => {
  it("returns null while the role is unknown, so no nav flashes", () => {
    expect(getNavItems(null)).toBeNull()
    expect(getNavItems(undefined)).toBeNull()
  })

  it("returns null for a role that is not in the config", () => {
    expect(getNavItems("ghost" as UserRole)).toBeNull()
  })

  it("covers every role", () => {
    expect(Object.keys(NAV_CONFIG).sort()).toEqual([...ROLES].sort())
  })
})

describe("hrefs that moved", () => {
  it("points the match diary at the matches page, not a settings screen", () => {
    const diary = itemsFor("player").find((item) => item.id === "match_diary")
    expect(diary?.kind === "link" && diary.href).toBe("/matches")
  })
})

describe("getBottomNav", () => {
  it.each(ROLES)("gives %s exactly five tabs, in order", (role) => {
    const bottom = getBottomNav(itemsFor(role))

    expect(bottom).toHaveLength(5)
    expect(ids(bottom)).toEqual([
      "home",
      ROLE_DESTINATION[role],
      "create",
      "messages",
      "profile",
    ])
  })

  it.each(ROLES)("never lets a sheet-only item into %s's bottom bar", (role) => {
    const bottom = getBottomNav(itemsFor(role))

    expect(bottom.every((item) => item.placement === "bottom")).toBe(true)
    expect(ids(bottom)).not.toContain("tournaments")
    expect(ids(bottom)).not.toContain("settings")
    expect(ids(bottom)).not.toContain("saved")
    expect(ids(bottom)).not.toContain("match_diary")
  })
})

describe("getTopBarNav", () => {
  it.each(ROLES)("gives %s the two mobile top-bar icons", (role) => {
    expect(ids(getTopBarNav(itemsFor(role)))).toEqual(["explore", "notifications"])
  })
})

describe("getSheetSections", () => {
  it("returns Discover then You, always in that order", () => {
    expect(getSheetSections(itemsFor("player")).map((s) => s.group)).toEqual([
      "discover",
      "you",
    ])
  })

  it("places every destination in declaration order", () => {
    const [discover, you] = getSheetSections(itemsFor("player"))

    expect(ids(discover.items)).toEqual(["home", "explore", "recruitments", "tournaments"])
    expect(ids(you.items)).toEqual([
      "messages",
      "notifications",
      "match_diary",
      "saved",
      "profile",
    ])
  })

  it.each(ROLES)("swaps in %s's own destination", (role) => {
    const [discover] = getSheetSections(itemsFor(role))
    expect(ids(discover.items)).toContain(ROLE_DESTINATION[role])
  })

  it("excludes the create trigger — it is not a destination", () => {
    const all = getSheetSections(itemsFor("player")).flatMap((s) => ids(s.items))
    expect(all).not.toContain("create")
  })

  it("excludes settings, which belongs to the sheet footer", () => {
    const all = getSheetSections(itemsFor("player")).flatMap((s) => ids(s.items))
    expect(all).not.toContain("settings")
    expect(getSheetFooter(itemsFor("player"))?.id).toBe("settings")
  })

  it("keeps Tournaments in Discover, flagged as not yet navigable", () => {
    const [discover] = getSheetSections(itemsFor("player"))
    const tournaments = discover.items.find((item) => item.id === "tournaments")

    expect(tournaments).toBeDefined()
    expect(tournaments?.disabled).toBe(true)
    expect(tournaments?.comingSoon).toBe(true)
  })

  it("honours sheetGroup over group, which is the point of Tournaments", () => {
    const tournaments = itemsFor("player").find((item) => item.id === "tournaments")
    // Desktop overflow ("you" → the More panel), mobile destination.
    expect(tournaments?.group).toBe("you")
    expect(tournaments?.sheetGroup).toBe("discover")

    const [discover, you] = getSheetSections(itemsFor("player"))
    expect(ids(discover.items)).toContain("tournaments")
    expect(ids(you.items)).not.toContain("tournaments")
  })

  it("lists each destination exactly once across the two sections", () => {
    const all = getSheetSections(itemsFor("player")).flatMap((s) => ids(s.items))
    expect(new Set(all).size).toBe(all.length)
  })
})

describe("the three desktop clusters", () => {
  it.each(ROLES)("gives %s three inline destinations and nothing else", (role) => {
    expect(ids(getDesktopPrimary(itemsFor(role)))).toEqual([
      "home",
      "explore",
      ROLE_DESTINATION[role],
    ])
  })

  it("keeps Tournaments out of the inline row — it is overflow on desktop", () => {
    expect(ids(getDesktopPrimary(itemsFor("player")))).not.toContain("tournaments")
  })

  it("flags Tournaments disabled and coming soon where More renders it", () => {
    const tournaments = getDesktopMore(itemsFor("player")).find(
      (item) => item.id === "tournaments"
    )

    expect(tournaments?.disabled).toBe(true)
    expect(tournaments?.comingSoon).toBe(true)
  })

  it.each(ROLES)("gives %s Messages then Alerts as right-cluster icons", (role) => {
    expect(ids(getDesktopRight(itemsFor(role)))).toEqual(["messages", "notifications"])
  })

  it.each(ROLES)("sends %s's remaining destinations to More, Tournaments last", (role) => {
    expect(ids(getDesktopMore(itemsFor(role)))).toEqual([
      "match_diary",
      "saved",
      "settings",
      "tournaments",
    ])
  })

  it("holds no account actions — those are the avatar dropdown's", () => {
    // The panel is destinations only; every row it is given is a link.
    expect(getDesktopMore(itemsFor("player")).every((item) => item.kind === "link")).toBe(true)
  })

  it("keeps the right-cluster icons out of the inline row and out of More", () => {
    const items = itemsFor("player")
    const primary = ids(getDesktopPrimary(items))
    const more = ids(getDesktopMore(items))

    for (const id of ["messages", "notifications"]) {
      expect(primary).not.toContain(id)
      expect(more).not.toContain(id)
    }
  })

  it("leaves the profile avatar out of all three — the component owns it", () => {
    const items = itemsFor("player")
    const everywhere = [
      ...ids(getDesktopPrimary(items)),
      ...ids(getDesktopRight(items)),
      ...ids(getDesktopMore(items)),
    ]

    expect(everywhere).not.toContain("profile")
    expect(everywhere).not.toContain("create")
  })
})
