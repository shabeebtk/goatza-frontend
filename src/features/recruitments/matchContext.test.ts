import { describe, expect, it } from "vitest"
import dayjs from "dayjs"

import { daysToDeadline, formatUrgency } from "./matchContext"

/**
 * The invariant these exist to protect: a deadline that has passed must never
 * read as open. It regressed because a deadline is a MOMENT while the label
 * counts DAYS — 13 Aug 10:00 is over by 13 Aug 13:00, but both
 * `diff(…, "day")` (truncates toward zero) and `ceil` report 0 for that, and
 * 0 means "Closes today".
 */
describe("daysToDeadline", () => {
  const now = dayjs("2026-08-13T13:00:00Z")

  it("reports a deadline earlier the same day as closed, not as today", () => {
    expect(daysToDeadline("2026-08-13T10:00:00Z", now)).toBe(-1)
  })

  it.each([
    ["one second ago", "2026-08-13T12:59:59Z"],
    ["one minute ago", "2026-08-13T12:59:00Z"],
    ["exactly now", "2026-08-13T13:00:00Z"],
  ])("treats %s as closed", (_label, deadline) => {
    expect(daysToDeadline(deadline, now)).toBeLessThan(0)
  })

  it("keeps counting further into the past", () => {
    expect(daysToDeadline("2026-08-03T13:00:00Z", now)).toBe(-10)
  })

  it("rounds a future deadline up, so under a day still reads as one", () => {
    expect(daysToDeadline("2026-08-13T14:00:00Z", now)).toBe(1)
    expect(daysToDeadline("2026-08-15T13:00:00Z", now)).toBe(2)
    expect(daysToDeadline("2026-08-31T13:00:00Z", now)).toBe(18)
  })

  it("returns null when there is no deadline to count to", () => {
    expect(daysToDeadline(null, now)).toBeNull()
    expect(daysToDeadline(undefined, now)).toBeNull()
    expect(daysToDeadline("", now)).toBeNull()
    expect(daysToDeadline("not-a-date", now)).toBeNull()
  })
})

describe("formatUrgency", () => {
  it("renders nothing when there is no deadline", () => {
    expect(formatUrgency(null)).toBeNull()
  })

  it("says so outright once applications have closed", () => {
    expect(formatUrgency(-1)).toEqual({
      label: "Applications closed",
      tone: "closed",
    })
  })

  it("reserves the error tone for the last day", () => {
    expect(formatUrgency(0)).toEqual({ label: "Closes today", tone: "today" })
    // 1–7 days is amber, NOT red: if a week out is already red, the last day
    // has nothing louder left to say.
    expect(formatUrgency(1)?.tone).toBe("soon")
    expect(formatUrgency(7)?.tone).toBe("soon")
    expect(formatUrgency(8)?.tone).toBe("calm")
  })

  it("words the near tiers as a person would", () => {
    expect(formatUrgency(1)?.label).toBe("Closes tomorrow")
    expect(formatUrgency(5)?.label).toBe("Closes in 5 days")
  })

  it("never reports an open deadline as closed, or the reverse", () => {
    const now = dayjs("2026-08-13T13:00:00Z")
    const past = ["2026-08-13T12:00:00Z", "2026-08-12T23:59:00Z"]
    const future = ["2026-08-13T13:00:01Z", "2026-09-01T00:00:00Z"]

    for (const d of past) {
      expect(formatUrgency(daysToDeadline(d, now))?.tone).toBe("closed")
    }
    for (const d of future) {
      expect(formatUrgency(daysToDeadline(d, now))?.tone).not.toBe("closed")
    }
  })
})
