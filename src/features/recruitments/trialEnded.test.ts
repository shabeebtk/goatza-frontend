/**
 * isTrialOver — the server's flag when it is there, the Kolkata calendar day
 * when it is not. The boundary is midnight IST, not the viewer's midnight and
 * not the trial's start time.
 */

import { describe, expect, it } from "vitest"

import { isTrialOver, kolkataDay } from "./trialEnded"

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
