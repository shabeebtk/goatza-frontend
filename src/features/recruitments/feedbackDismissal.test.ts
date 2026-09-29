/**
 * The 7-day suppression window on the trial-feedback prompt.
 *
 * Pure logic only — `isDismissed` and `withDismissal` take `now`, so none of
 * this needs a clock or a DOM. The storage wrappers around them are thin
 * try/catch edges with no decisions in them.
 */

import { describe, expect, it } from "vitest"

import {
  DISMISS_MS,
  isDismissed,
  withDismissal,
} from "./feedbackDismissal"

const NOW = new Date("2026-10-20T09:00:00Z").getTime()
const APP = "app-1"

describe("isDismissed", () => {
    it("is false with nothing stored", () => {
        expect(isDismissed({}, APP, NOW)).toBe(false)
        expect(isDismissed(null, APP, NOW)).toBe(false)
        expect(isDismissed(undefined, APP, NOW)).toBe(false)
    })

    it("is false for a different application", () => {
        expect(isDismissed({ "app-2": NOW }, APP, NOW)).toBe(false)
    })

    it("holds for the whole 7 days and lapses after", () => {
        const justDismissed = { [APP]: NOW }
        expect(isDismissed(justDismissed, APP, NOW)).toBe(true)

        // Six days later: still hidden.
        const sixDays = NOW + 6 * 24 * 60 * 60 * 1000
        expect(isDismissed(justDismissed, APP, sixDays)).toBe(true)

        // A moment before the boundary, and a moment after.
        expect(isDismissed(justDismissed, APP, NOW + DISMISS_MS - 1)).toBe(true)
        expect(isDismissed(justDismissed, APP, NOW + DISMISS_MS)).toBe(false)
        expect(isDismissed(justDismissed, APP, NOW + DISMISS_MS + 1)).toBe(false)
    })

    it("treats junk as not dismissed, so the prompt still shows", () => {
        // Whatever wrote these, the safe direction is to ask again rather than
        // to silence the prompt forever on a corrupt value.
        expect(isDismissed({ [APP]: NaN }, APP, NOW)).toBe(false)
        expect(isDismissed({ [APP]: Infinity }, APP, NOW)).toBe(false)
        expect(
            isDismissed({ [APP]: "yesterday" } as never, APP, NOW)
        ).toBe(false)
    })

    it("honours a stamp in the future rather than re-asking at once", () => {
        // A clock that was wrong when they tapped, or is wrong now. They DID
        // dismiss it, and asking again immediately is the worse answer.
        expect(isDismissed({ [APP]: NOW + 60_000 }, APP, NOW)).toBe(true)
    })
})

describe("withDismissal", () => {
    it("stamps the application with now", () => {
        expect(withDismissal({}, APP, NOW)).toEqual({ [APP]: NOW })
    })

    it("keeps other live dismissals", () => {
        const fresh = NOW - 1000
        const next = withDismissal({ "app-2": fresh }, APP, NOW)

        expect(next).toEqual({ "app-2": fresh, [APP]: NOW })
    })

    it("prunes expired entries, so the map cannot grow forever", () => {
        // A player applying to trials for a year would otherwise accumulate an
        // entry per application and nothing would ever clean them up.
        const expired = NOW - DISMISS_MS - 1
        const next = withDismissal(
            { "old-1": expired, "old-2": expired, "live": NOW - 1000 },
            APP,
            NOW
        )

        expect(Object.keys(next).sort()).toEqual(["app-1", "live"])
    })

    it("re-stamps an application dismissed again", () => {
        const later = NOW + 60_000
        const next = withDismissal({ [APP]: NOW }, APP, later)

        expect(next[APP]).toBe(later)
        expect(isDismissed(next, APP, later + DISMISS_MS - 1)).toBe(true)
    })
})
