/**
 * Eligibility — the recruiter's own words about who may attend.
 *
 * Two rules everything here defends:
 *  - an EMPTY age-group list means "open to all ages", so nothing may invent a
 *    group for it and nothing may treat it as missing data;
 *  - a group may be open-ended, so exactly one bound is a complete answer.
 *
 * And one rule by omission: nothing in this module ever takes a birthdate,
 * because Goatza displays eligibility and never judges it.
 */

import { describe, expect, it } from "vitest"

import {
    ageGroupApplyPayload,
    ageGroupOptionLabel,
    buildAgeCategoriesPayload,
    formatBirthYears,
    formatReportingTime,
    isAgeGroupRequired,
    summarizeAgeGroups,
    validateAgeGroupChoice,
    validateAgeGroups,
    type AgeGroupDraft,
} from "./eligibility"
import type { RecruitmentAgeCategory } from "./services/recruitments.api"

const CURRENT_YEAR = 2026

function group(over: Partial<RecruitmentAgeCategory> = {}): RecruitmentAgeCategory {
    return {
        id: "group-1",
        title: "U17",
        min_birth_year: 2010,
        max_birth_year: null,
        reporting_time: null,
        ...over,
    }
}

function draft(over: Partial<AgeGroupDraft> = {}): AgeGroupDraft {
    return {
        id: "draft-1",
        title: "U15",
        min_birth_year: 2011,
        max_birth_year: 2012,
        reporting_time: "",
        showReportingTime: false,
        display_order: 0,
        ...over,
    }
}

describe("formatBirthYears", () => {
    it("reads a closed range as a span", () => {
        expect(formatBirthYears(2011, 2012)).toBe("Born 2011–2012")
    })

    it("reads a min-only group as open-ended forwards", () => {
        expect(formatBirthYears(2010, null)).toBe("Born 2010 or later")
    })

    it("reads a max-only group as open-ended backwards", () => {
        expect(formatBirthYears(null, 1991)).toBe("Born 1991 or earlier")
    })

    it("collapses a one-year range instead of repeating the year", () => {
        expect(formatBirthYears(2010, 2010)).toBe("Born 2010")
    })

    it("says nothing when neither bound is set", () => {
        // Not an error state to render — the caller decides what an unbounded
        // group looks like (usually: it can't exist, so this never shows).
        expect(formatBirthYears(null, null)).toBe("")
        expect(formatBirthYears(undefined, undefined)).toBe("")
    })
})

describe("summarizeAgeGroups", () => {
    it("calls an empty list all ages — the list IS the statement", () => {
        expect(summarizeAgeGroups([])).toBe("All ages")
    })

    it("renders nothing at all when the payload never carried groups", () => {
        // A card fed by an older list response must skip the chip rather than
        // claim the recruitment is open to everyone.
        expect(summarizeAgeGroups(undefined)).toBeNull()
    })

    it("uses the single group's own title", () => {
        expect(summarizeAgeGroups([{ title: "U17" }])).toBe("U17")
    })

    it("spans first to last for several groups", () => {
        expect(
            summarizeAgeGroups([{ title: "U15" }, { title: "U16" }, { title: "U17" }])
        ).toBe("U15–U17")
    })
})

describe("validateAgeGroups", () => {
    it("accepts a closed range", () => {
        expect(validateAgeGroups([draft()], CURRENT_YEAR)).toBeNull()
    })

    it("accepts a group with only a min", () => {
        expect(
            validateAgeGroups(
                [draft({ min_birth_year: 2010, max_birth_year: null })],
                CURRENT_YEAR
            )
        ).toBeNull()
    })

    it("accepts a group with only a max", () => {
        expect(
            validateAgeGroups(
                [draft({ min_birth_year: null, max_birth_year: 1991 })],
                CURRENT_YEAR
            )
        ).toBeNull()
    })

    it("rejects a group with neither year", () => {
        const error = validateAgeGroups(
            [draft({ min_birth_year: null, max_birth_year: null })],
            CURRENT_YEAR
        )
        expect(error).toMatch(/set a min or a max birth year/i)
    })

    it("rejects an inverted range", () => {
        const error = validateAgeGroups(
            [draft({ min_birth_year: 2012, max_birth_year: 2010 })],
            CURRENT_YEAR
        )
        expect(error).toMatch(/cannot exceed/i)
    })

    it("rejects a year below the 1950 floor the backend enforces", () => {
        const error = validateAgeGroups(
            [draft({ min_birth_year: null, max_birth_year: 1949 })],
            CURRENT_YEAR
        )
        expect(error).toMatch(/between 1950 and 2026/)
    })

    it("rejects a year in the future", () => {
        const error = validateAgeGroups(
            [draft({ min_birth_year: 2027, max_birth_year: null })],
            CURRENT_YEAR
        )
        expect(error).toMatch(/between 1950 and 2026/)
    })

    it("rejects an untitled group", () => {
        expect(validateAgeGroups([draft({ title: "   " })], CURRENT_YEAR)).toMatch(
            /need a title/i
        )
    })

    it("reports the first offender when several are wrong", () => {
        const error = validateAgeGroups(
            [
                draft(),
                draft({ id: "d2", title: "U17", min_birth_year: 2012, max_birth_year: 2010 }),
                draft({ id: "d3", title: "U19", min_birth_year: null, max_birth_year: null }),
            ],
            CURRENT_YEAR
        )
        expect(error).toContain("U17")
    })
})

describe("buildAgeCategoriesPayload", () => {
    it("submits an empty list for open-to-all-ages", () => {
        // Even with groups still sitting in wizard state — the radio wins, and
        // an empty list is the only way the server hears "all ages".
        expect(buildAgeCategoriesPayload([draft()], true)).toEqual([])
    })

    it("carries an existing group's server id back so the edit is a diff", () => {
        // Without the id the backend recreates the row, which SET_NULLs the
        // group every applicant already applied under.
        const payload = buildAgeCategoriesPayload(
            [draft({ serverId: "server-abc", title: "U15 Boys" })],
            false
        )
        expect(payload).toEqual([
            {
                id: "server-abc",
                title: "U15 Boys",
                min_birth_year: 2011,
                max_birth_year: 2012,
                reporting_time: undefined,
                display_order: 0,
            },
        ])
    })

    it("sends a brand-new group without an id", () => {
        const [row] = buildAgeCategoriesPayload([draft()], false)
        expect(row).not.toHaveProperty("id")
    })

    it("keeps ids on edit while adding new rows alongside them", () => {
        const payload = buildAgeCategoriesPayload(
            [
                draft({ id: "d1", serverId: "server-1", title: "U15" }),
                draft({ id: "d2", title: "U17", min_birth_year: 2010, max_birth_year: null }),
            ],
            false
        )
        expect(payload.map((row) => row.id)).toEqual(["server-1", undefined])
    })

    it("passes a null bound through instead of dropping the group", () => {
        const [row] = buildAgeCategoriesPayload(
            [draft({ min_birth_year: 2010, max_birth_year: null })],
            false
        )
        expect(row.max_birth_year).toBeNull()
    })

    it("renumbers display_order from the list's own order", () => {
        const payload = buildAgeCategoriesPayload(
            [
                draft({ id: "d1", display_order: 7 }),
                draft({ id: "d2", title: "U17", display_order: 3 }),
            ],
            false
        )
        expect(payload.map((row) => row.display_order)).toEqual([0, 1])
    })

    it("sends a reporting time only when the row actually enables one", () => {
        const withTime = buildAgeCategoriesPayload(
            [draft({ showReportingTime: true, reporting_time: "09:00" })],
            false
        )
        expect(withTime[0].reporting_time).toBe("09:00:00")

        const toggledOff = buildAgeCategoriesPayload(
            [draft({ showReportingTime: false, reporting_time: "09:00" })],
            false
        )
        expect(toggledOff[0].reporting_time).toBeUndefined()
    })
})

describe("the applicant's group choice", () => {
    const groups = [group({ id: "g1", title: "U15" }), group({ id: "g2", title: "U17" })]

    it("is only asked for when the recruitment published groups", () => {
        expect(isAgeGroupRequired(groups)).toBe(true)
        expect(isAgeGroupRequired([])).toBe(false)
        expect(isAgeGroupRequired(undefined)).toBe(false)
    })

    it("passes validation unanswered when there are no groups", () => {
        expect(validateAgeGroupChoice([], "")).toBeNull()
        expect(validateAgeGroupChoice(undefined, "")).toBeNull()
    })

    it("blocks an unanswered choice when there are groups", () => {
        expect(validateAgeGroupChoice(groups, "")).toMatch(/select the age group/i)
    })

    it("blocks a group that isn't on offer here", () => {
        expect(validateAgeGroupChoice(groups, "someone-elses-group")).toMatch(
            /select the age group/i
        )
    })

    it("accepts any offered group — a mismatched age is not this app's call", () => {
        expect(validateAgeGroupChoice(groups, "g1")).toBeNull()
        expect(validateAgeGroupChoice(groups, "g2")).toBeNull()
    })

    it("puts the chosen id in the apply payload", () => {
        expect(ageGroupApplyPayload(groups, "g2")).toEqual({ age_category: "g2" })
    })

    it("omits the key entirely for an all-ages recruitment", () => {
        // Not `{ age_category: null }` — the field simply isn't part of the
        // request, exactly as it was before groups existed.
        expect(ageGroupApplyPayload([], "")).toEqual({})
        expect(ageGroupApplyPayload(undefined, "anything")).toEqual({})
    })
})

describe("option labels", () => {
    it("pairs the title with its range", () => {
        expect(ageGroupOptionLabel(group({ title: "U17", min_birth_year: 2010 })))
            .toBe("U17 — Born 2010 or later")
    })

    it("adds the reporting time when the organiser set one", () => {
        expect(
            ageGroupOptionLabel(
                group({
                    title: "U15",
                    min_birth_year: 2011,
                    max_birth_year: 2012,
                    reporting_time: "09:00:00",
                })
            )
        ).toBe("U15 — Born 2011–2012 · report 9:00 AM")
    })
})

describe("formatReportingTime", () => {
    it("turns a 24h server time into a readable one", () => {
        expect(formatReportingTime("09:00:00")).toBe("9:00 AM")
        expect(formatReportingTime("14:30:00")).toBe("2:30 PM")
    })

    it("handles both ends of the clock", () => {
        expect(formatReportingTime("00:15:00")).toBe("12:15 AM")
        expect(formatReportingTime("12:00:00")).toBe("12:00 PM")
    })

    it("says nothing for a missing time", () => {
        expect(formatReportingTime(null)).toBe("")
        expect(formatReportingTime(undefined)).toBe("")
    })
})
