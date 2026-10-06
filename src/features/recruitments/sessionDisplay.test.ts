/**
 * How a trial DATE reads, and in what ORDER the apply picker offers them.
 *
 * The two things worth pinning here are both about a multi-centre trial:
 *
 *   * the ORDER. A four-city tour in date order makes a Kozhikode player
 *     scroll past Kochi, Thrissur and Trivandrum to reach the one 4 km
 *     away. `sessionsByDistance` answers their question instead; date order
 *     answers a different one.
 *   * the ZONE. Every date is named on the VENUE's calendar, so the same row
 *     reads as a different day for a London trial than for a Kochi one, and
 *     "today" moves with it — which decides what is still pickable at all.
 *
 * The distances are SERVED: the viewer's coordinates live on the server, so
 * a payload without them has to sort and label exactly as it did before.
 */

import { describe, expect, it } from "vitest"

import {
    formatSessionDate,
    formatSessionTime,
    sessionOptionLabel,
    sessionsByDistance,
    upcomingSessions,
} from "./sessionDisplay"
import type { TrialSession } from "./services/recruitments.api"

const KOLKATA = "Asia/Kolkata"
const LONDON = "Europe/London"

/** The trial's own venue, which a date only mentions when it differs. */
const TRIAL = {
    venue_name: "Corporation Stadium",
    city: "Kochi",
    timezone: KOLKATA,
}

/**
 * One centre. `distance_km` is left OFF entirely when undefined rather than
 * set to undefined, because "the server did not measure this" and "the
 * server measured it as nothing" are different states and the sort treats
 * them the same only by accident otherwise.
 */
function centre(
    id: string,
    city: string,
    date: string,
    distance_km?: number | null,
): TrialSession {
    return {
        id,
        title: "",
        date,
        start_time: "07:00:00",
        end_time: null,
        is_cancelled: false,
        venue_name: "",
        venue_link: "",
        city,
        latitude: 0,
        longitude: 0,
        ...(distance_km === undefined ? {} : { distance_km }),
    }
}

/** A four-city tour, in the DATE order the API sends it. */
function tour(): TrialSession[] {
    return [
        centre("kochi", "Kochi", "2030-05-04", 156.9),
        centre("thrissur", "Thrissur", "2030-05-11", 98.4),
        centre("kozhikode", "Kozhikode", "2030-05-18", 4.2),
        centre("trivandrum", "Trivandrum", "2030-05-25", 331.0),
    ]
}

const ids = (sessions: TrialSession[]) => sessions.map((s) => s.id)

describe("sessionsByDistance", () => {
    it("puts the nearest centre first, whatever the dates say", () => {
        // The Kozhikode centre is the LAST date but the first option.
        expect(ids(sessionsByDistance(tour()))).toEqual([
            "kozhikode", "thrissur", "kochi", "trivandrum",
        ])
    })

    it("does not mutate its input", () => {
        const rows = tour()
        const before = ids(rows)

        sessionsByDistance(rows)

        expect(ids(rows)).toEqual(before)
    })

    it("returns every centre, adding and dropping none", () => {
        const rows = tour()
        const sorted = sessionsByDistance(rows)

        expect(sorted).toHaveLength(rows.length)
        expect([...ids(sorted)].sort()).toEqual([...ids(rows)].sort())
    })

    it("sends centres with no distance LAST, in date order", () => {
        // An unknown distance is not a short one, so it must not sort to the
        // top — and within the unmeasured group the calendar decides.
        const mixed = [
            centre("far", "Trivandrum", "2030-05-25", 331.0),
            centre("unknown-late", "Palakkad", "2030-05-20", null),
            centre("near", "Kozhikode", "2030-05-18", 4.2),
            centre("unknown-early", "Kannur", "2030-05-05", null),
        ]

        expect(ids(sessionsByDistance(mixed))).toEqual([
            "near", "far", "unknown-early", "unknown-late",
        ])
    })

    it("treats an absent key the same as a null distance", () => {
        const mixed = [
            centre("absent", "Palakkad", "2030-05-20"),
            centre("near", "Kozhikode", "2030-05-18", 4.2),
        ]

        expect(ids(sessionsByDistance(mixed))).toEqual(["near", "absent"])
    })

    it("falls back to date order entirely when nothing has a distance", () => {
        // The anonymous case: the server measured nothing, so the picker is
        // exactly the list it always was.
        const anon = tour().map((s) => centre(s.id, s.city!, s.date))

        expect(ids(sessionsByDistance(anon))).toEqual([
            "kochi", "thrissur", "kozhikode", "trivandrum",
        ])
    })

    it("breaks a distance tie on date, then on start time", () => {
        const tied = [
            { ...centre("later", "Kochi", "2030-05-18", 4.2), start_time: "14:00:00" },
            { ...centre("earlier", "Kochi", "2030-05-18", 4.2), start_time: "09:00:00" },
            centre("next-week", "Kochi", "2030-05-25", 4.2),
        ]

        expect(ids(sessionsByDistance(tied))).toEqual([
            "earlier", "later", "next-week",
        ])
    })

    it("is stable for an empty list", () => {
        expect(sessionsByDistance([])).toEqual([])
    })
})

describe("sessionOptionLabel", () => {
    it("appends the distance only when the centre has one", () => {
        const measured = centre("kozhikode", "Kozhikode", "2030-05-18", 4.2)

        const label = sessionOptionLabel(measured, TRIAL)

        // Date, time, place, then the distance LAST — "4 km" answers nothing
        // until you know 4 km to where.
        expect(label).toBe("Sat 18 May · 7:00 am · Kozhikode · 4 km")
    })

    it("says nothing about distance when the server measured none", () => {
        const anon = centre("kozhikode", "Kozhikode", "2030-05-18")

        const label = sessionOptionLabel(anon, TRIAL)

        expect(label).toBe("Sat 18 May · 7:00 am · Kozhikode")
        expect(label).not.toContain("km")
    })

    it("adds nothing for a null distance either", () => {
        const unknown = centre("palakkad", "Palakkad", "2030-05-20", null)

        expect(sessionOptionLabel(unknown, TRIAL)).not.toContain("km")
    })

    it("says nothing about a centre at the trial's OWN venue", () => {
        // sessionPlace answers "where, but only when it is somewhere else":
        // repeating "Kochi" under a Kochi trial tells a player nothing.
        const home = centre("home", "Kochi", "2030-05-04", 2.0)

        expect(sessionOptionLabel(home, TRIAL)).toBe(
            "Sat 4 May · 7:00 am · 2 km",
        )
    })
})

describe("the venue's calendar", () => {
    it("names a bare date the same day in any zone", () => {
        // "YYYY-MM-DD" is pinned to noon UTC before formatting, so it cannot
        // slip a day either side.
        expect(formatSessionDate("2030-05-18", KOLKATA)).toBe("Sat 18 May")
        expect(formatSessionDate("2030-05-18", LONDON)).toBe("Sat 18 May")
    })

    it("hands back an unparseable date untouched", () => {
        expect(formatSessionDate("not a date", KOLKATA)).toBe("not a date")
    })

    it("reads a stored time as the wall clock it already is", () => {
        // No zone, and that is not an omission: "09:00:00" is the time the
        // org typed at the venue, so converting it would be the bug.
        expect(formatSessionTime("09:00:00")).toBe("9:00 am")
        expect(formatSessionTime("14:30:00")).toBe("2:30 pm")
        expect(formatSessionTime(null)).toBeNull()
    })

    it("decides what is still pickable on the VENUE's today", () => {
        // 20 Oct 2026, 20:00 UTC — still the 20th in London (21:00 BST), and
        // already the 21st in Kolkata (01:30). So the 20th is on offer at a
        // London ground and gone at an Indian one, from one instant.
        const now = new Date("2026-10-20T20:00:00Z").getTime()
        const rows = [
            centre("today", "Kozhikode", "2026-10-20"),
            centre("tomorrow", "Kochi", "2026-10-21"),
        ]

        expect(ids(upcomingSessions(rows, LONDON, now))).toEqual([
            "today", "tomorrow",
        ])
        expect(ids(upcomingSessions(rows, KOLKATA, now))).toEqual(["tomorrow"])
    })

    it("never offers a cancelled centre", () => {
        const now = new Date("2026-10-01T00:00:00Z").getTime()
        const rows = [
            { ...centre("off", "Kochi", "2026-10-20"), is_cancelled: true },
            centre("on", "Kozhikode", "2026-10-21"),
        ]

        expect(ids(upcomingSessions(rows, KOLKATA, now))).toEqual(["on"])
    })
})

describe("the picker's two steps, in order", () => {
    it("eligibility decides WHICH centres, distance only their order", () => {
        // The nearest centre has already happened. Ordering must not drag it
        // back into a list the server would refuse.
        const now = new Date("2026-10-06T00:00:00Z").getTime()
        const rows = [
            centre("past-and-nearest", "Kochi", "2020-01-01", 1.0),
            centre("future-and-far", "Trivandrum", "2030-05-25", 331.0),
            centre("future-and-near", "Kozhikode", "2030-05-18", 4.2),
        ]

        const offered = sessionsByDistance(upcomingSessions(rows, KOLKATA, now))

        expect(ids(offered)).toEqual(["future-and-near", "future-and-far"])
        // And the count an empty state reads is the ELIGIBLE count, never
        // "how many have a distance".
        expect(offered).toHaveLength(2)
    })
})
