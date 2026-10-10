/**
 * Eligibility — the recruiter's own words about who may attend.
 *
 * Two rules everything here defends:
 *  - an EMPTY age-group list means "open to all ages", so nothing may invent a
 *    group for it and nothing may treat it as missing data;
 *  - a group may be open-ended, so exactly one bound is a complete answer.
 *
 * And one rule by omission: nothing in this module ever takes a birthdate,
 * because Goatza displays eligibility and never judges it. The one exception,
 * birthYearInGroup, takes a birth YEAR for a warning the player acknowledges —
 * it never refuses or pre-selects anything.
 */

import { describe, expect, it } from "vitest"

import {
    ageGroupApplyPayload,
    ageGroupGenderWord,
    ageGroupOptionLabel,
    birthYearInGroup,
    buildAgeCategoriesPayload,
    categoriesForSession,
    effectiveGender,
    formatBirthYears,
    formatReportingTime,
    genderFitsGroup,
    genderLabel,
    isAgeGroupRequired,
    sessionsForCategory,
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
        gender: null,
        session_ids: [],
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
        gender: "",
        sessionKeys: [],
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

// Mirrors the backend's birth_year_in_category bound for bound: a null bound
// never excludes, and a year on either edge is inside.
describe("birthYearInGroup", () => {
    it("is inside a closed range, edges included", () => {
        const u13 = group({ min_birth_year: 2011, max_birth_year: 2012 })
        expect(birthYearInGroup(u13, 2011)).toBe(true)
        expect(birthYearInGroup(u13, 2012)).toBe(true)
    })

    it("is outside a closed range on either side", () => {
        const u13 = group({ min_birth_year: 2011, max_birth_year: 2012 })
        expect(birthYearInGroup(u13, 2008)).toBe(false)
        expect(birthYearInGroup(u13, 2013)).toBe(false)
    })

    it("treats a missing min as open-ended backwards", () => {
        const veterans = group({ min_birth_year: null, max_birth_year: 1991 })
        expect(birthYearInGroup(veterans, 1960)).toBe(true)
        expect(birthYearInGroup(veterans, 1992)).toBe(false)
    })

    it("treats a missing max as open-ended forwards", () => {
        const u17 = group({ min_birth_year: 2010, max_birth_year: null })
        expect(birthYearInGroup(u17, 2016)).toBe(true)
        expect(birthYearInGroup(u17, 2009)).toBe(false)
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
                // Both sent explicitly, always: null is "inherit the trial's
                // gender" and [] is "runs at every centre". An OMITTED key
                // on an edit would leave the stored value untouched instead
                // of clearing it.
                gender: null,
                session_refs: [],
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


/**
 * CATEGORY x CENTRE — the pair the apply modal filters on.
 *
 * EMPTY MEANS ALL on both sides, and that is the whole reason these helpers
 * are worth pinning: read the other way round, an unlinked category would
 * run NOWHERE and a plain trial would offer a player nothing at all.
 */
describe("categoriesForSession", () => {
    const anywhere = group({ id: "cat-anywhere", title: "U18" })
    const kochiOnly = group({
        id: "cat-kochi", title: "U21", session_ids: ["sess-kochi"],
    })
    const kannurOnly = group({
        id: "cat-kannur", title: "U23", session_ids: ["sess-kannur"],
    })
    const both = group({
        id: "cat-both", title: "Seniors",
        session_ids: ["sess-kochi", "sess-kannur"],
    })

    it("offers an unlinked category at every centre", () => {
        const ids = (sessionId: string) =>
            categoriesForSession([anywhere], sessionId).map((c) => c.id)

        expect(ids("sess-kochi")).toEqual(["cat-anywhere"])
        expect(ids("sess-kannur")).toEqual(["cat-anywhere"])
    })

    it("offers a linked category only at the centres it names", () => {
        const all = [anywhere, kochiOnly, kannurOnly, both]

        expect(categoriesForSession(all, "sess-kochi").map((c) => c.id))
            .toEqual(["cat-anywhere", "cat-kochi", "cat-both"])
        expect(categoriesForSession(all, "sess-kannur").map((c) => c.id))
            .toEqual(["cat-anywhere", "cat-kannur", "cat-both"])
    })

    it("filters nothing until a centre is picked", () => {
        const all = [anywhere, kochiOnly]
        expect(categoriesForSession(all, "")).toEqual(all)
    })

    it("has nothing to offer for an absent list", () => {
        expect(categoriesForSession(undefined, "sess-kochi")).toEqual([])
    })
})

describe("sessionsForCategory", () => {
    const kochi = { id: "sess-kochi" }
    const kannur = { id: "sess-kannur" }
    const centres = [kochi, kannur]

    it("gives every centre to a category that names none", () => {
        expect(sessionsForCategory(centres, group())).toEqual(centres)
        // An absent category is the same question unanswered, not a
        // narrowing — the apply modal is in that state before a pick.
        expect(sessionsForCategory(centres, undefined)).toEqual(centres)
    })

    it("narrows to the centres a linked category names", () => {
        expect(
            sessionsForCategory(centres, group({ session_ids: ["sess-kannur"] })),
        ).toEqual([kannur])
    })

    it("drops a link to a centre that is no longer on offer", () => {
        // A date that has passed is not in the list it filters, so a stale
        // link resolves to nothing rather than to a date nobody can pick.
        expect(
            sessionsForCategory([kochi], group({ session_ids: ["sess-kannur"] })),
        ).toEqual([])
    })
})

describe("effectiveGender", () => {
    it("prefers the category's own gender", () => {
        expect(effectiveGender(group({ gender: "female" }), "male")).toBe("female")
    })

    it("inherits the trial's when the category sets none", () => {
        expect(effectiveGender(group({ gender: null }), "male")).toBe("male")
        expect(effectiveGender(group(), "all")).toBe("all")
    })

    it("reads a blank or absent trial gender as unset", () => {
        expect(effectiveGender(group({ gender: null }), "")).toBe("")
        expect(effectiveGender(undefined, undefined)).toBe("")
    })
})

describe("genderFitsGroup", () => {
    it("passes an unknown viewer gender — the backend's own rule", () => {
        // Missing data is never a disqualifier. A player who left the field
        // blank must not be warned about a category they may well fit.
        for (const unknown of ["", null, undefined]) {
            expect(genderFitsGroup(group({ gender: "female" }), "all", unknown))
                .toBe(true)
        }
    })

    it("passes a category open to everyone", () => {
        expect(genderFitsGroup(group({ gender: "all" }), "male", "female"))
            .toBe(true)
        // Nothing set anywhere is the same answer.
        expect(genderFitsGroup(group({ gender: null }), "", "female")).toBe(true)
    })

    it("passes a match and fails the other gender", () => {
        const girls = group({ gender: "female" })
        expect(genderFitsGroup(girls, "all", "female")).toBe(true)
        expect(genderFitsGroup(girls, "all", "male")).toBe(false)
    })

    it("reads the INHERITED gender when the category sets none", () => {
        const inheriting = group({ gender: null })
        expect(genderFitsGroup(inheriting, "male", "male")).toBe(true)
        expect(genderFitsGroup(inheriting, "male", "female")).toBe(false)
    })

    it("fails a profile gender the trial does not take at all", () => {
        // "other" is a real stored profile value, and a girls-only category
        // is not for it — a warning, which the modal lets them tick past.
        expect(genderFitsGroup(group({ gender: "female" }), "all", "other"))
            .toBe(false)
    })
})

describe("option labels — the gender word", () => {
    it("adds the word when the effective gender names one", () => {
        expect(
            ageGroupOptionLabel(
                group({
                    title: "U15", min_birth_year: 2011, max_birth_year: 2012,
                    gender: "female", reporting_time: "08:30:00",
                }),
                "all",
            ),
        ).toBe("U15 — Girls · Born 2011–2012 · report 8:30 AM")
    })

    it("does NOT repeat a word the title already carries", () => {
        // The wizard's auto-title writes "U15 Girls" the moment a chip is
        // picked, so appending blindly would read "U15 Girls · Girls".
        for (const title of ["U15 Girls", "u15 girls", "Women's U21", "U18 Boys"]) {
            expect(
                ageGroupOptionLabel(
                    group({ title, min_birth_year: 2011, gender: "female" }),
                    "all",
                ),
            ).toBe(`${title} — Born 2011 or later`)
        }
    })

    it("adds nothing for a category open to everyone", () => {
        expect(
            ageGroupOptionLabel(
                group({ title: "U15", min_birth_year: 2011, gender: "all" }),
                "all",
            ),
        ).toBe("U15 — Born 2011 or later")
    })

    it("reads the trial's gender through an inheriting category", () => {
        expect(
            ageGroupOptionLabel(
                group({ title: "U15", min_birth_year: 2011, gender: null }),
                "male",
            ),
        ).toBe("U15 — Boys · Born 2011 or later")
    })

    it("says nothing about gender when no trial gender is passed", () => {
        // How the ORG side calls it: they know their own trial's gender, so
        // the word is only worth showing when the CATEGORY sets one.
        expect(ageGroupGenderWord(group({ gender: null, title: "U15" }))).toBe("")
        expect(ageGroupGenderWord(group({ gender: "female", title: "U15" })))
            .toBe("Girls")
    })
})

describe("genderLabel", () => {
    it("names the two, and reads everything else as Any", () => {
        expect(genderLabel("male")).toBe("Boys")
        expect(genderLabel("female")).toBe("Girls")
        expect(genderLabel("all")).toBe("Any")
        expect(genderLabel("")).toBe("Any")
        expect(genderLabel(null)).toBe("Any")
    })
})

describe("summarizeAgeGroups — split by gender", () => {
    it("lists the groups when any of them names a gender", () => {
        // "U15–U15" says nothing about a trial running Boys U15 and Girls
        // U15, so a split trial is listed rather than spanned.
        expect(
            summarizeAgeGroups([
                { title: "U15", gender: "male" },
                { title: "U15", gender: "female" },
            ]),
        ).toBe("U15 Boys, U15 Girls")
    })

    it("leaves a trial whose groups all inherit exactly as it was", () => {
        expect(
            summarizeAgeGroups([
                { title: "U15", gender: null },
                { title: "U17", gender: null },
            ]),
        ).toBe("U15–U17")
        // `all` is not a split either — it says what the trial already said.
        expect(
            summarizeAgeGroups([
                { title: "U15", gender: "all" },
                { title: "U17", gender: "all" },
            ]),
        ).toBe("U15–U17")
    })
})
