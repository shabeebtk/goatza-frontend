import { describe, expect, it } from "vitest"

import {
  ageLabel,
  countLabel,
  currentSeasonLabel,
  fileSlug,
  freeJerseyNumbers,
  initialsOf,
  jerseyHolder,
  playerLine,
  squadMeta,
} from "./squadUtils"
import type { MemberItem, Roster } from "./types"

function member(id: string, jersey: number | null, status = "active"): MemberItem {
  return {
    id,
    status,
    source: "link",
    user: { id: `u-${id}`, username: id, name: `Player ${id}`, photo: "", age: 16 },
    primary_position: null,
    position: null,
    jersey_number: jersey,
    is_captain: false,
    joined_at: "2026-06-01T00:00:00Z",
    career_entry_id: null,
  }
}

function roster(...members: MemberItem[]): Roster {
  return {
    count: members.length,
    groups: [
      { name: "Defenders", count: 1, members: members.slice(0, 1) },
      { name: "Other", count: members.length - 1, members: members.slice(1) },
    ],
  }
}

describe("currentSeasonLabel", () => {
  it("is last year into this one before June, this year into next from June", () => {
    expect(currentSeasonLabel(new Date(2026, 4, 31))).toBe("2025–26")
    expect(currentSeasonLabel(new Date(2026, 5, 1))).toBe("2026–27")
    expect(currentSeasonLabel(new Date(2026, 0, 15))).toBe("2025–26")
    expect(currentSeasonLabel(new Date(2026, 11, 31))).toBe("2026–27")
  })

  it("writes the next year's last two digits, padded, after an en dash", () => {
    expect(currentSeasonLabel(new Date(2099, 6, 1))).toBe("2099–00")
    expect(currentSeasonLabel(new Date(2008, 6, 1))).toBe("2008–09")
    expect(currentSeasonLabel(new Date(2026, 6, 1))).toContain("–")
  })
})

describe("squadMeta", () => {
  it("joins the parts with a middle dot and skips what is empty", () => {
    expect(squadMeta({ level_label: "Youth", age_group: "U17", season: "2026–27" })).toBe(
      "Youth · U17 · 2026–27"
    )
    expect(squadMeta({ level_label: "", age_group: "U17", season: "" })).toBe("U17")
    expect(squadMeta({ level_label: "Senior", age_group: "  ", season: "2026" })).toBe(
      "Senior · 2026"
    )
    expect(squadMeta({ level_label: "", age_group: "", season: "" })).toBe("")
  })
})

describe("freeJerseyNumbers", () => {
  it("gives the lowest numbers no active player wears", () => {
    const taken = roster(member("a", 1), member("b", 2), member("c", 4))
    expect(freeJerseyNumbers(taken)).toEqual([3, 5, 6, 7, 8, 9])
    expect(freeJerseyNumbers(taken, 3)).toEqual([3, 5, 6])
  })

  it("ignores players with no number and rows that are not active", () => {
    const rows = roster(member("a", null), member("b", 1, "left"), member("c", 2))
    expect(freeJerseyNumbers(rows, 2)).toEqual([1, 3])
  })

  it("works with no roster yet, and stops at 99", () => {
    expect(freeJerseyNumbers(undefined, 2)).toEqual([1, 2])
    const full = roster(...Array.from({ length: 98 }, (_, index) => member(`p${index}`, index + 1)))
    expect(freeJerseyNumbers(full)).toEqual([99])
  })
})

describe("jerseyHolder", () => {
  const rows = roster(member("a", 9), member("b", 4))

  it("finds who wears a number, except the player being edited", () => {
    expect(jerseyHolder(rows, 9)?.id).toBe("a")
    expect(jerseyHolder(rows, 9, "a")).toBeUndefined()
    expect(jerseyHolder(rows, 7)).toBeUndefined()
    expect(jerseyHolder(undefined, 9)).toBeUndefined()
  })
})

describe("small labels", () => {
  it("ageLabel", () => {
    expect(ageLabel(16)).toBe("16 yrs")
    expect(ageLabel(0)).toBe("0 yrs")
    expect(ageLabel(null)).toBe("")
    expect(ageLabel(undefined)).toBe("")
  })

  it("playerLine falls back to No position, and drops a missing age", () => {
    expect(playerLine({ name: "Centre-back" }, 16)).toBe("Centre-back · 16 yrs")
    expect(playerLine(null, 16)).toBe("No position · 16 yrs")
    expect(playerLine({ name: "Striker" }, null)).toBe("Striker")
  })

  it("countLabel", () => {
    expect(countLabel(1, "player", "players")).toBe("1 player")
    expect(countLabel(0, "player", "players")).toBe("0 players")
    expect(countLabel(12, "squad", "squads")).toBe("12 squads")
  })

  it("initialsOf", () => {
    expect(initialsOf("bilal")).toBe("BI")
    expect(initialsOf("")).toBe("?")
    expect(initialsOf(null)).toBe("?")
  })

  it("fileSlug makes a file-safe name", () => {
    expect(fileSlug("U17 Boys")).toBe("u17-boys")
    expect(fileSlug("  Sénior  Men!! ")).toBe("senior-men")
    expect(fileSlug("***")).toBe("")
  })
})
