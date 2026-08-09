/**
 * Eligibility — the recruiter's own words about who may attend.
 *
 * Goatza DISPLAYS eligibility, it never enforces it: nothing in here reads the
 * viewer's birthdate, gender or profile, and no surface tells a player they
 * are or aren't eligible. Verification happens at the venue.
 *
 * Two ideas the whole feature rests on:
 *  - An EMPTY age-group list means "open to all ages". There is no flag; the
 *    radio in the create form is pure UI state that submits `[]`.
 *  - A group may be open-ended. Only one bound has to be set: min only reads
 *    "born 2010 or later", max only reads "born 1991 or earlier". Both unset
 *    is invalid — that is what an empty list already says.
 */

import type {
    CreateRecruitmentAgeCategoryPayload,
    RecruitmentAgeCategory,
} from "./services/recruitments.api"

/** Matches the backend's `min_value=1950` on both birth-year fields. */
export const MIN_BIRTH_YEAR = 1950

/**
 * The one place a birth-year range becomes words. Every surface that shows a
 * range — the create form's live preview, the detail page, the apply modal,
 * the org pipeline — calls this, so the wording can never drift.
 *
 *   (2011, 2012) → "Born 2011–2012"
 *   (2010, null) → "Born 2010 or later"
 *   (null, 1991) → "Born 1991 or earlier"
 *   (2010, 2010) → "Born 2010"
 *   (null, null) → "" (caller decides what an unbounded group looks like)
 */
export function formatBirthYears(
    min: number | null | undefined,
    max: number | null | undefined,
): string {
    const hasMin = typeof min === "number"
    const hasMax = typeof max === "number"

    if (hasMin && hasMax) {
        return min === max ? `Born ${min}` : `Born ${min}–${max}`
    }
    if (hasMin) return `Born ${min} or later`
    if (hasMax) return `Born ${max} or earlier`
    return ""
}

/**
 * The compact age summary for a list card: "All ages" when the recruitment is
 * open, the single group's title when there is one, and a first–last span when
 * there are several. `undefined` (rather than `[]`) means the payload never
 * carried categories, so the card should render no chip at all.
 */
export function summarizeAgeGroups(
    groups: Pick<RecruitmentAgeCategory, "title">[] | undefined,
): string | null {
    if (!groups) return null
    if (groups.length === 0) return "All ages"

    const titles = groups.map(g => g.title.trim()).filter(Boolean)
    if (titles.length === 0) return "All ages"
    if (titles.length === 1) return titles[0]
    return `${titles[0]}–${titles[titles.length - 1]}`
}

// ── Create / edit form ────────────────────────────────────────

/**
 * The shape the create/edit wizard keeps a group in while it is being edited.
 * `serverId` is the row's id on the backend and is only set for a group that
 * already exists — echoing it back is what makes the save a diff instead of a
 * wipe-and-recreate (which would drop every applicant's chosen group).
 */
export type AgeGroupDraft = {
    /** Local, per-session React key — NOT the server id. */
    id: string
    serverId?: string
    title: string
    min_birth_year: number | null
    max_birth_year: number | null
    reporting_time: string      // "HH:MM" or ""
    showReportingTime: boolean
    display_order: number
}

/**
 * Validate the authored groups. Returns the first problem as a sentence, or
 * null when they are all saveable. Mirrors the backend's rules so a save never
 * round-trips just to be told the same thing.
 */
export function validateAgeGroups(
    groups: Pick<AgeGroupDraft, "title" | "min_birth_year" | "max_birth_year">[],
    currentYear: number,
): string | null {
    for (const group of groups) {
        const title = group.title.trim()
        if (!title) return "All age groups need a title."

        const { min_birth_year: min, max_birth_year: max } = group

        if (min == null && max == null) {
            return `"${title}": set a min or a max birth year (leave the other empty for an open-ended group).`
        }
        if (min != null && max != null && min > max) {
            return `"${title}": min birth year cannot exceed max birth year.`
        }
        for (const year of [min, max]) {
            if (year != null && (year < MIN_BIRTH_YEAR || year > currentYear)) {
                return `"${title}": birth years must be between ${MIN_BIRTH_YEAR} and ${currentYear}.`
            }
        }
    }
    return null
}

/**
 * Wizard state → the `age_categories` request body.
 *
 * "Open to all ages" submits an empty list. Otherwise every pre-existing group
 * carries its `id` back so the backend updates it in place; brand-new rows go
 * without one and get created.
 */
export function buildAgeCategoriesPayload(
    groups: AgeGroupDraft[],
    allAges: boolean,
): CreateRecruitmentAgeCategoryPayload[] {
    if (allAges) return []

    return groups.map((group, idx) => ({
        ...(group.serverId ? { id: group.serverId } : {}),
        title: group.title.trim(),
        min_birth_year: group.min_birth_year,
        max_birth_year: group.max_birth_year,
        reporting_time:
            group.showReportingTime && group.reporting_time
                ? `${group.reporting_time}:00`
                : undefined,
        display_order: idx,
    }))
}

// ── Apply flow ────────────────────────────────────────────────

/**
 * The apply form requires a group only when the recruitment actually has them.
 * No groups → no field, and the payload omits `age_category` entirely.
 */
export function isAgeGroupRequired(
    groups: RecruitmentAgeCategory[] | undefined,
): boolean {
    return (groups?.length ?? 0) > 0
}

/**
 * Validate the player's pick. Returns the error sentence, or null when the
 * application can be submitted. Note what this does NOT do: it never compares
 * the choice against the player's age — any offered group is a valid answer.
 */
export function validateAgeGroupChoice(
    groups: RecruitmentAgeCategory[] | undefined,
    selectedId: string,
): string | null {
    if (!isAgeGroupRequired(groups)) return null
    if (!selectedId) return "Select the age group you are applying for."
    if (!groups?.some(g => g.id === selectedId)) {
        return "Select the age group you are applying for."
    }
    return null
}

/**
 * The `age_category` slice of the apply body. Omitted entirely — not sent as
 * null — when the recruitment has no groups, so an older client and an
 * all-ages recruitment produce the same request they always did.
 */
export function ageGroupApplyPayload(
    groups: RecruitmentAgeCategory[] | undefined,
    selectedId: string,
): { age_category?: string } {
    if (!isAgeGroupRequired(groups) || !selectedId) return {}
    return { age_category: selectedId }
}

/** The option label in the apply modal's group select. */
export function ageGroupOptionLabel(group: RecruitmentAgeCategory): string {
    const range = formatBirthYears(group.min_birth_year, group.max_birth_year)
    const time = group.reporting_time
        ? `report ${formatReportingTime(group.reporting_time)}`
        : ""
    const detail = [range, time].filter(Boolean).join(" · ")
    return detail ? `${group.title} — ${detail}` : group.title
}

/** "09:00:00" → "9:00 AM". Returns "" for a missing time. */
export function formatReportingTime(value: string | null | undefined): string {
    if (!value) return ""
    const [rawHour = "", rawMinute = "00"] = value.split(":")
    const hour = Number(rawHour)
    if (!Number.isFinite(hour)) return ""
    const suffix = hour < 12 ? "AM" : "PM"
    const hour12 = hour % 12 === 0 ? 12 : hour % 12
    return `${hour12}:${rawMinute} ${suffix}`
}
