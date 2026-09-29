/**
 * isTrialOver — the server's flag when it is there, the Kolkata calendar day
 * when it is not. The boundary is midnight IST, not the viewer's midnight and
 * not the trial's start time.
 */

import { describe, expect, it } from "vitest"

import { isTrialDayAhead, isTrialOver, kolkataDay } from "./trialEnded"

// 2026-08-11 18:30 IST — a trial at 6:30pm.
const TRIAL = "2026-08-11T13:00:00Z"

describe("kolkataDay", () => {
    it("is the ISO calendar day in Asia/Kolkata", () => {
        // 22:30 UTC is already 04:00 the next day in IST.
        expect(kolkataDay("2026-08-11T22:30:00Z")).toBe("2026-08-12")
        expect(kolkataDay("2026-08-11T18:29:00Z")).toBe("2026-08-11")
    })

    it("is null for garbage", () => {
        expect(kolkataDay("not a date")).toBeNull()
    })
})

describe("isTrialOver", () => {
    it("trusts the server's flag when it is present", () => {
        expect(isTrialOver({ is_trial_over: true, event_date: "2999-01-01T00:00:00Z" })).toBe(true)
        expect(isTrialOver({ is_trial_over: false, event_date: "2000-01-01T00:00:00Z" })).toBe(false)
    })

    it("is not over while the trial day is still running in IST", () => {
        // 9pm IST the same day — the 6:30pm trial has started, the DAY has not ended.
        const now = new Date("2026-08-11T15:30:00Z").getTime()
        expect(isTrialOver({ event_date: TRIAL }, now)).toBe(false)
    })

    it("is over from midnight IST, not the viewer's midnight", () => {
        // 18:31 UTC on the 11th is 00:01 IST on the 12th.
        const justAfterMidnightIst = new Date("2026-08-11T18:31:00Z").getTime()
        expect(isTrialOver({ event_date: TRIAL }, justAfterMidnightIst)).toBe(true)

        // 18:29 UTC is 23:59 IST on the 11th: still the trial day.
        const justBefore = new Date("2026-08-11T18:29:00Z").getTime()
        expect(isTrialOver({ event_date: TRIAL }, justBefore)).toBe(false)
    })

    it("is over the day after, and long after", () => {
        expect(isTrialOver({ event_date: TRIAL }, new Date("2026-08-12T12:00:00Z").getTime())).toBe(true)
        expect(isTrialOver({ event_date: TRIAL }, new Date("2027-01-01T12:00:00Z").getTime())).toBe(true)
    })

    it("never ends a trial with no date", () => {
        expect(isTrialOver({ event_date: null }, Date.now())).toBe(false)
        expect(isTrialOver({}, Date.now())).toBe(false)
        expect(isTrialOver(null)).toBe(false)
    })

    it("ignores a null flag and falls back to the day", () => {
        const after = new Date("2026-08-12T12:00:00Z").getTime()
        expect(isTrialOver({ is_trial_over: null, event_date: TRIAL }, after)).toBe(true)
    })
})

// A trial that runs over more than one date: the first weekend has passed,
// the last has not. The two functions must disagree about it — that is the
// whole point of keeping them apart.
describe("isTrialOver across several dates", () => {
    const FIRST = "2026-08-11T13:00:00Z" // 11 Aug 18:30 IST
    const LAST = "2026-08-25T18:29:00Z" // 25 Aug 23:59 IST

    // 18 Aug — after weekend one, a week before the last.
    const MIDWAY = new Date("2026-08-18T12:00:00Z").getTime()

    it("is not over while a later date is still to come", () => {
        expect(isTrialOver({ event_date: FIRST, trial_end_date: LAST }, MIDWAY)).toBe(false)
    })

    it("reads trial_end_date, not event_date", () => {
        // event_date alone would call this ended; trial_end_date wins.
        expect(isTrialOver({ event_date: FIRST }, MIDWAY)).toBe(true)
        expect(isTrialOver({ event_date: FIRST, trial_end_date: LAST }, MIDWAY)).toBe(false)
    })

    it("is over once the LAST date has passed in IST", () => {
        const after = new Date("2026-08-26T12:00:00Z").getTime()
        expect(isTrialOver({ event_date: FIRST, trial_end_date: LAST }, after)).toBe(true)
    })

    it("falls back to event_date when trial_end_date is missing or null", () => {
        const after = new Date("2026-08-12T12:00:00Z").getTime()
        expect(isTrialOver({ event_date: FIRST, trial_end_date: null }, after)).toBe(true)
        expect(isTrialOver({ event_date: FIRST }, after)).toBe(true)
        // ...and with neither, nothing ever ends.
        expect(isTrialOver({ event_date: null, trial_end_date: null }, after)).toBe(false)
    })

    it("still lets the server's flag win over both dates", () => {
        expect(
            isTrialOver({ is_trial_over: false, event_date: FIRST, trial_end_date: LAST }, Date.now())
        ).toBe(false)
    })
})

describe("isTrialDayAhead stays on the FIRST date", () => {
    const FIRST = "2026-08-11T13:00:00Z"

    it("opens results on the first date, not the last", () => {
        // Midway: weekend one has been and gone, so results are open even
        // though the trial itself runs on.
        const midway = new Date("2026-08-18T12:00:00Z").getTime()
        expect(isTrialDayAhead(FIRST, midway)).toBe(false)

        // Before it, they are not.
        const before = new Date("2026-08-01T12:00:00Z").getTime()
        expect(isTrialDayAhead(FIRST, before)).toBe(true)
    })
})
