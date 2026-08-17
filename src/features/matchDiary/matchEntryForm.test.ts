/**
 * The match entry form's rules, tested where they are decided.
 *
 * Three things here are easy to get subtly wrong and impossible to notice from
 * the outside:
 *
 *   1. Stat input. An INTEGER field that "strips the dot" turns a typed 2.5
 *      into 25 — a number the player never entered, in a season total they
 *      will later be asked to defend.
 *   2. The date rules. The past-fixture rule has to NOT fire on an overdue
 *      fixture, which is the exact row the diary keeps nagging them to log.
 *   3. Empty stats. "" is "not logged" and must never reach the wire as a 0 —
 *      the summary's zero_count is what makes clean sheets mean anything.
 */

import { describe, expect, it } from "vitest"

import {
    sanitizeStatInput,
    stepStatValue,
} from "./components/MatchEntrySheet/StatInputRow"
import { toCreateMatchPayload, toPartialUpdateMatchPayload } from "./services/matches.api"
import {
    emptyMatchEntryForm,
    makeMatchEntryFormSchema,
    todayIso,
    upcomingMatchToForm,
    type MatchStatField,
    type UpcomingMatch,
} from "./types"

// ── Fixtures ──────────────────────────────────────────────────

const statField = (
    overrides: Partial<MatchStatField> = {}
): MatchStatField => ({
    id: "stat-1",
    name: "Goals",
    short_label: "G",
    unit: "",
    value_type: "integer",
    is_primary: true,
    order: 1,
    position_ids: [],
    ...overrides,
})

const INTEGER_FIELD = statField()
const DECIMAL_FIELD = statField({
    id: "stat-2",
    name: "Distance covered",
    short_label: "DIST",
    unit: "km",
    value_type: "decimal",
})

/** A local `YYYY-MM-DD` offset from today — same clock `todayIso` reads. */
const dayOffset = (days: number): string => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-")
}

const playedForm = (overrides = {}) =>
    emptyMatchEntryForm({
        sport: "sport-1",
        date: todayIso(),
        ...overrides,
    })

// ── Stat input ────────────────────────────────────────────────

describe("sanitizeStatInput", () => {
    it("refuses a decimal on an integer stat and keeps what was there", () => {
        // The failure this guards: "strip the dot" would give "25".
        expect(sanitizeStatInput("2.5", "2", INTEGER_FIELD)).toEqual({
            value: "2",
            note: "Goals is a whole number.",
        })
    })

    it("accepts whole numbers on an integer stat", () => {
        expect(sanitizeStatInput("12", "1", INTEGER_FIELD)).toEqual({
            value: "12",
            note: null,
        })
    })

    it("keeps one decimal place and says when it trimmed one", () => {
        expect(sanitizeStatInput("10.5", "10", DECIMAL_FIELD)).toEqual({
            value: "10.5",
            note: null,
        })
        expect(sanitizeStatInput("10.55", "10.5", DECIMAL_FIELD)).toEqual({
            value: "10.5",
            note: "One decimal place.",
        })
    })

    it("reads a comma keypad as a decimal point", () => {
        expect(sanitizeStatInput("8,5", "8", DECIMAL_FIELD).value).toBe("8.5")
    })

    it("leads a bare decimal with a zero", () => {
        expect(sanitizeStatInput(".5", "", DECIMAL_FIELD).value).toBe("0.5")
    })

    it("drops anything that isn't a number without comment", () => {
        expect(sanitizeStatInput("2a", "2", INTEGER_FIELD)).toEqual({
            value: "2",
            note: null,
        })
        expect(sanitizeStatInput("-3", "2", INTEGER_FIELD).value).toBe("2")
    })

    it("always allows clearing the field", () => {
        expect(sanitizeStatInput("", "7", INTEGER_FIELD)).toEqual({
            value: "",
            note: null,
        })
    })
})

describe("stepStatValue", () => {
    it("logs two goals in two taps", () => {
        const once = stepStatValue("", INTEGER_FIELD, 1)
        expect(once).toBe("1")
        expect(stepStatValue(once, INTEGER_FIELD, 1)).toBe("2")
    })

    it("steps a decimal stat by a half", () => {
        expect(stepStatValue("", DECIMAL_FIELD, 1)).toBe("0.5")
        expect(stepStatValue("10", DECIMAL_FIELD, 1)).toBe("10.5")
    })

    it("keeps zero reachable but clears below it", () => {
        expect(stepStatValue("1", INTEGER_FIELD, -1)).toBe("0")
        expect(stepStatValue("0", INTEGER_FIELD, -1)).toBe("")
    })

    it("stepping down from empty stays empty", () => {
        expect(stepStatValue("", INTEGER_FIELD, -1)).toBe("")
    })

    it("will not step past the column's ceiling", () => {
        expect(stepStatValue("999999.99", DECIMAL_FIELD, 1)).toBe("999999.99")
    })
})

// ── Dates and modes ───────────────────────────────────────────

describe("match entry date rules", () => {
    const schema = makeMatchEntryFormSchema()
    const existingFixtureSchema = makeMatchEntryFormSchema({
        isExistingFixture: true,
    })

    it("refuses a played match dated in the future", () => {
        const result = schema.safeParse(playedForm({ date: dayOffset(1) }))
        expect(result.success).toBe(false)
        expect(result.error?.issues[0]?.path).toEqual(["date"])
    })

    it("accepts a played match dated today or earlier", () => {
        expect(schema.safeParse(playedForm({ date: todayIso() })).success).toBe(
            true
        )
        expect(
            schema.safeParse(playedForm({ date: dayOffset(-7) })).success
        ).toBe(true)
    })

    it("refuses a NEW fixture dated in the past", () => {
        const result = schema.safeParse(
            playedForm({ status: "scheduled", date: dayOffset(-1) })
        )
        expect(result.success).toBe(false)
        expect(result.error?.issues[0]?.path).toEqual(["date"])
    })

    it("accepts an EXISTING fixture dated in the past — that is what overdue means", () => {
        const result = existingFixtureSchema.safeParse(
            playedForm({ status: "scheduled", date: dayOffset(-9) })
        )
        expect(result.success).toBe(true)
    })
})

describe("match entry field rules", () => {
    const schema = makeMatchEntryFormSchema()

    it("refuses minutes that are not a whole, non-negative number", () => {
        for (const minutes of ["45.5", "-10", "ninety"]) {
            const result = schema.safeParse(playedForm({ minutes_played: minutes }))
            expect(result.success, minutes).toBe(false)
        }

        expect(schema.safeParse(playedForm({ minutes_played: "90" })).success).toBe(true)
        expect(schema.safeParse(playedForm({ minutes_played: "" })).success).toBe(true)
    })

    it("holds the self rating to 1-5, and lets it be unset", () => {
        expect(schema.safeParse(playedForm({ self_rating: 0 })).success).toBe(false)
        expect(schema.safeParse(playedForm({ self_rating: 6 })).success).toBe(false)
        expect(schema.safeParse(playedForm({ self_rating: 3 })).success).toBe(true)
        expect(schema.safeParse(playedForm({ self_rating: null })).success).toBe(true)
    })

    it("refuses a stat value that is negative or past the column's ceiling", () => {
        const withStat = (value: string) =>
            schema.safeParse(
                playedForm({ stats: [{ stat_field_id: "stat-1", value }] })
            )

        expect(withStat("-1").success).toBe(false)
        expect(withStat("1000000").success).toBe(false)
        expect(withStat("2").success).toBe(true)
        expect(withStat("").success).toBe(true)
    })

    it("refuses a fixture carrying anything only a played match can have", () => {
        const fixture = (overrides: object) =>
            schema.safeParse(
                playedForm({
                    status: "scheduled",
                    date: dayOffset(3),
                    ...overrides,
                })
            )

        expect(fixture({ result: "win" }).success).toBe(false)
        expect(fixture({ minutes_played: "90" }).success).toBe(false)
        expect(fixture({ self_rating: 4 }).success).toBe(false)
        expect(
            fixture({ stats: [{ stat_field_id: "stat-1", value: "2" }] }).success
        ).toBe(false)
        expect(fixture({}).success).toBe(true)
    })
})

// ── Form → payload ────────────────────────────────────────────

describe("toCreateMatchPayload", () => {
    it("drops the stats the player left blank rather than sending zeros", () => {
        const payload = toCreateMatchPayload(
            playedForm({
                stats: [
                    { stat_field_id: "stat-1", value: "2" },
                    { stat_field_id: "stat-2", value: "" },
                    { stat_field_id: "stat-3", value: "0" },
                ],
            })
        )

        // A logged 0 stays — it is the clean sheet. A blank never becomes one.
        expect(payload.stats).toEqual([
            { stat_field_id: "stat-1", value: 2 },
            { stat_field_id: "stat-3", value: 0 },
        ])
    })

    it("sends no photo unless both halves are set", () => {
        expect(
            toCreateMatchPayload(playedForm({ photo_url: "https://x/y.webp" }))
        ).not.toHaveProperty("photo_url")

        expect(
            toCreateMatchPayload(
                playedForm({
                    photo_url: "https://x/y.webp",
                    photo_public_id: "users/1/matches/y",
                })
            )
        ).toMatchObject({
            photo_url: "https://x/y.webp",
            photo_public_id: "users/1/matches/y",
        })
    })
})

describe("toPartialUpdateMatchPayload", () => {
    it("removes the keys the sheet never loaded, so a PATCH cannot blank them", () => {
        const payload = toPartialUpdateMatchPayload(
            playedForm({ opponent_name: "Riverside FC" }),
            ["notes", "career_entry"]
        )

        expect(payload).not.toHaveProperty("notes")
        expect(payload).not.toHaveProperty("career_entry")
        expect(payload.opponent_name).toBe("Riverside FC")
    })
})

describe("upcomingMatchToForm", () => {
    const fixture: UpcomingMatch = {
        id: "match-1",
        date: "2026-08-01",
        kickoff_time: "15:00:00",
        opponent_name: "Riverside FC",
        match_type: "league",
        sport: {
            id: "sport-1",
            name: "Football",
            icon_name: "football",
            icon_url: "",
        },
        position: { id: "pos-1", name: "Striker" },
        is_overdue: true,
    }

    it("carries everything a fixture holds, and nothing it cannot", () => {
        expect(upcomingMatchToForm(fixture)).toMatchObject({
            sport: "sport-1",
            status: "scheduled",
            date: "2026-08-01",
            // HH:MM:SS off the wire, HH:MM for <input type="time">.
            kickoff_time: "15:00",
            opponent_name: "Riverside FC",
            match_type: "league",
            position: "pos-1",
            result: "na",
            minutes_played: "",
            self_rating: null,
            stats: [],
        })
    })
})
