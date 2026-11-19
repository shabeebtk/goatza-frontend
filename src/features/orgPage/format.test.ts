/** The page's words and numbers: Phase 3's public page reuses every one of these. */

import { describe, expect, it } from "vitest"

import {
  formatAges,
  formatBranch,
  formatDays,
  formatFee,
  formatPhone,
  formatTimeRange,
  orgNoun,
} from "./format"

describe("formatFee", () => {
  it("shows the amount in rupees, Indian grouping, no decimals, with its period", () => {
    expect(formatFee({ mode: "amount", amount: 1500, per: "month" })).toBe("₹1,500 / month")
    expect(formatFee({ mode: "amount", amount: 125000, per: "year" })).toBe("₹1,25,000 / year")
    expect(formatFee({ mode: "amount", amount: 300, per: "session" })).toBe("₹300 / session")
    expect(formatFee({ mode: "amount", amount: 900, per: null })).toBe("₹900")
  })

  it("says Contact for fees when there is no amount to show", () => {
    expect(formatFee({ mode: "contact", amount: null, per: null })).toBe("Contact for fees")
    expect(formatFee({ mode: "amount", amount: null, per: "month" })).toBe("Contact for fees")
  })
})

describe("formatAges", () => {
  it("reads a range, or one age when both ends match", () => {
    expect(formatAges(8, 12)).toBe("Ages 8 – 12")
    expect(formatAges(8, 8)).toBe("Age 8")
  })

  it("reads one open end, and nothing for none", () => {
    expect(formatAges(6, null)).toBe("Ages 6+")
    expect(formatAges(null, 18)).toBe("Up to age 18")
    expect(formatAges(null, null)).toBe("")
  })
})

describe("formatDays", () => {
  it("names the whole week, the working week and the weekend", () => {
    expect(formatDays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).toBe("Every day")
    expect(formatDays(["mon", "tue", "wed", "thu", "fri"])).toBe("Mon – Fri")
    expect(formatDays(["sat", "sun"])).toBe("Weekends")
  })

  it("lists scattered days in week order, whatever order they came in", () => {
    expect(formatDays(["sat", "tue", "thu"])).toBe("Tue · Thu · Sat")
    expect(formatDays(["fri", "sat"])).toBe("Fri · Sat")
  })

  it("folds a run of three or more into a range and keeps the rest", () => {
    expect(formatDays(["mon", "tue", "wed", "fri"])).toBe("Mon – Wed · Fri")
    expect(formatDays(["tue", "thu", "fri", "sat", "sun"])).toBe("Tue · Thu – Sun")
    expect(formatDays(["mon", "tue", "thu", "fri", "sat"])).toBe("Mon · Tue · Thu – Sat")
  })

  it("is empty for no days", () => {
    expect(formatDays([])).toBe("")
  })
})

describe("formatTimeRange", () => {
  it("says the period once when both ends share it", () => {
    expect(formatTimeRange("16:30", "18:00")).toBe("4:30 – 6:00 PM")
    expect(formatTimeRange("06:00", "07:30")).toBe("6:00 – 7:30 AM")
  })

  it("says both periods across noon, and reads noon and midnight as 12", () => {
    expect(formatTimeRange("11:00", "13:00")).toBe("11:00 AM – 1:00 PM")
    expect(formatTimeRange("12:00", "13:30")).toBe("12:00 – 1:30 PM")
    expect(formatTimeRange("00:30", "01:00")).toBe("12:30 – 1:00 AM")
  })

  it("takes seconds and gives nothing for a broken time", () => {
    expect(formatTimeRange("16:30:00", "18:00:00")).toBe("4:30 – 6:00 PM")
    expect(formatTimeRange("", "18:00")).toBe("")
  })
})

describe("formatPhone", () => {
  it("spaces an Indian mobile and leaves anything else as stored", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210")
    expect(formatPhone("+447700900123")).toBe("+447700900123")
    expect(formatPhone("")).toBe("")
    expect(formatPhone(null)).toBe("")
  })
})

describe("formatBranch and orgNoun", () => {
  it("names a branch with its city, once", () => {
    expect(formatBranch({ name: "Main Ground", city: "Thrissur" })).toBe("Main Ground, Thrissur")
    expect(formatBranch({ name: "Kochi", city: "Kochi" })).toBe("Kochi")
    expect(formatBranch(null)).toBe("")
  })

  it("says what the page is, and never the raw value of a type it doesn't know", () => {
    expect(orgNoun("academy")).toBe("academy")
    expect(orgNoun("club")).toBe("club")
    expect(orgNoun("school")).toBe("organization")
  })
})
