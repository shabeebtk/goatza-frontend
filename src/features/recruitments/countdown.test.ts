/**
 * The deadline countdown — the unit switches and the closed/open boundary.
 *
 * `now` is injected, so the cases that matter (a minute before the deadline, a
 * minute after it) are asked directly rather than mocked. The exact boundary is
 * the point of the whole function: it decides whether a player sees a green
 * "apply" or a red "you missed it".
 */

import { describe, expect, it } from "vitest"

import { countdownTickMs, formatCountdown } from "./countdown"

const NOW = new Date("2026-08-11T10:00:00Z").getTime()

/** ISO for `hours` from NOW. */
function inHours(hours: number): string {
    return new Date(NOW + hours * 3600_000).toISOString()
}

describe("formatCountdown", () => {
    it("counts days and hours when more than a day remains", () => {
        // 2d 6h out — the mockup's headline case.
        expect(formatCountdown(inHours(54), "active", NOW)).toEqual({
            label: "Closes in 2d 6h",
            tone: "open",
        })
    })

    // Minutes are noise at this range and would make the chip twitch.
    it("omits minutes above a day", () => {
        const { label } = formatCountdown(inHours(30.5), "active", NOW)!
        expect(label).toBe("Closes in 1d 6h")
    })

    it("switches to hours and minutes inside the last day", () => {
        expect(formatCountdown(inHours(6.5), "active", NOW)).toEqual({
            label: "Closes in 6h 30m",
            tone: "open",
        })
    })

    it("switches to minutes only inside the last hour", () => {
        expect(formatCountdown(inHours(0.5), "active", NOW)).toEqual({
            label: "Closes in 30m",
            tone: "open",
        })
    })

    // Rounding the last seconds down to "0m" would read as expired while the
    // form is still open.
    it("says 'Closing now' under a minute rather than 0m", () => {
        expect(formatCountdown(inHours(0.008), "active", NOW)).toEqual({
            label: "Closing now",
            tone: "open",
        })
    })

    // ── The boundary ─────────────────────────────────────────
    it("is still open one minute before the deadline", () => {
        expect(formatCountdown(inHours(1 / 60), "active", NOW)?.tone).toBe("open")
    })

    it("is closed one minute after the deadline, naming the date", () => {
        expect(formatCountdown(inHours(-1 / 60), "active", NOW)).toEqual({
            label: "Closed 11 Aug",
            tone: "closed",
        })
    })

    it("is closed exactly at the deadline", () => {
        expect(formatCountdown(inHours(0), "active", NOW)?.tone).toBe("closed")
    })

    // ── Status overrides the clock ───────────────────────────
    // Closed EARLY: the deadline is still in the future, so it is not the date
    // this closed on. Naming it would announce a closure that has not happened.
    it("says a bare 'Closed' when closed early, never the future deadline", () => {
        expect(formatCountdown(inHours(54), "closed", NOW)).toEqual({
            label: "Closed",
            tone: "closed",
        })
    })

    // Whereas a deadline that HAS passed is a real date worth naming.
    it("names the date when the deadline is what closed it", () => {
        expect(formatCountdown(inHours(-48), "closed", NOW)).toEqual({
            label: "Closed 9 Aug",
            tone: "closed",
        })
    })

    it("treats cancelled as closed", () => {
        expect(formatCountdown(inHours(54), "cancelled", NOW)?.tone).toBe("closed")
    })

    it("says a bare 'Closed' when a closed posting has no deadline", () => {
        expect(formatCountdown(null, "closed", NOW)).toEqual({
            label: "Closed",
            tone: "closed",
        })
    })

    // An open posting with no deadline has nothing to count down. A red chip
    // invented from a missing field would be a lie.
    it("returns null for an open posting with no deadline", () => {
        expect(formatCountdown(null, "active", NOW)).toBeNull()
        expect(formatCountdown(undefined, undefined, NOW)).toBeNull()
    })
})

describe("countdownTickMs", () => {
    it("does not tick once closed", () => {
        expect(countdownTickMs({ label: "Closed 11 Aug", tone: "closed" })).toBeNull()
        expect(countdownTickMs(null)).toBeNull()
    })

    // A label showing minutes has to move every minute; "2d 6h" does not.
    it("ticks slowly for a day-scale label and quickly for a minute-scale one", () => {
        const slow = countdownTickMs({ label: "Closes in 2d 6h", tone: "open" })!
        const fast = countdownTickMs({ label: "Closes in 30m", tone: "open" })!

        expect(slow).toBeGreaterThan(fast)
        expect(fast).toBeLessThanOrEqual(60_000)
    })
})
