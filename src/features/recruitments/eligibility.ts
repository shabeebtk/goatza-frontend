/**
 * Eligibility — the recruiter's own words about who may attend.
 *
 * Goatza DISPLAYS eligibility, it never enforces it: nothing in here reads the
 * viewer's profile, and no surface refuses a player for their age.
 * Verification happens at the venue. The one comparison, `birthYearInGroup`,
 * powers a WARNING the player acknowledges and the org-side age flag — never
 * a gate, never a pre-selection.
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
    RecruitmentGender,
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

/** "Boys" / "Girls" for a group that names a gender, "" for one that does not. */
function genderWord(gender: RecruitmentGender | null | undefined): string {
    if (gender === "male") return "Boys"
    if (gender === "female") return "Girls"
    // "all" and null both mean "whoever the trial is open to" — nothing to
    // add, because the trial already said it.
    return ""
}

/**
 * One group as every surface names it: its title, plus the gender it names
 * when the title does not already carry it.
 *
 * The wizard's auto-title already writes "U15 Boys" when a gender chip is
 * picked, so appending blindly would read "U15 Boys Boys". A title the org
 * typed by hand gets the word added; one that already ends in it does not —
 * which is what lets "Keepers only" + Girls read right on the card, in the
 * wizard's own preview and in the summary below, from one function.
 */
export function ageGroupLabel(
    group: Pick<RecruitmentAgeCategory, "title"> &
        Partial<Pick<RecruitmentAgeCategory, "gender">>,
): string {
    const title = group.title.trim()
    const word = genderWord(group.gender)
    if (!word) return title
    if (!title) return word
    return title.toLowerCase().endsWith(word.toLowerCase())
        ? title
        : `${title} ${word}`
}

/**
 * The compact age summary for a list card: "All ages" when the recruitment is
 * open, the single group's title when there is one, and a first–last span when
 * there are several. `undefined` (rather than `[]`) means the payload never
 * carried categories, so the card should render no chip at all.
 *
 * A SPLIT-BY-GENDER trial is the exception to the span. "U15–U15" says
 * nothing about a trial running Boys U15 and Girls U15, so when ANY group
 * names a gender the groups are listed instead: "U15 Boys, U15 Girls". A
 * trial whose groups all inherit reads exactly as it always did.
 */
export function summarizeAgeGroups(
    groups:
        | (Pick<RecruitmentAgeCategory, "title"> &
            Partial<Pick<RecruitmentAgeCategory, "gender">>)[]
        | undefined,
): string | null {
    if (!groups) return null
    if (groups.length === 0) return "All ages"

    const split = groups.some(g => genderWord(g.gender) !== "")
    const titles = groups
        .map(g => (split ? ageGroupLabel(g) : g.title.trim()))
        .filter(Boolean)

    if (titles.length === 0) return "All ages"
    if (titles.length === 1) return titles[0]
    if (split) return titles.join(", ")
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
    /**
     * WHO this group is for. "" is the default and the common case: the
     * group inherits the trial's own gender, and the wizard does not even
     * ask — the chips only appear on a trial open to everyone.
     */
    gender: "" | RecruitmentGender
    /**
     * WHERE this group runs, as session handles. [] is the default and the
     * common case: every date.
     *
     * The values are `sessionRef(draft)` — the server id of a date that
     * exists, the local key of one that does not yet — NEVER the bare
     * React key, because these have to match what each session row sends as
     * its `ref` in the same payload. See that function's comment.
     */
    sessionKeys: string[]
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
        // "" is the wizard's "inherit"; the server spells that null.
        gender: group.gender || null,
        // The same handles the session rows send as `ref` — see
        // `sessionRef`, which is where both sides get them from. Empty means
        // every date, which is also what the server reads an empty list as.
        session_refs: group.sessionKeys,
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

/**
 * Whether a birth year falls inside ONE group's band.
 *
 * Read EXACTLY the way the backend does (birth_year_in_category in
 * apps/recruitments/services/eligibility_service.py, which the stored
 * age_mismatch_at_apply flag and the ranking badge both use): a null bound
 * never excludes, and both bounds belong to THIS group row. If the two ever
 * disagreed, an org would see a mismatch badge the player was never warned
 * about — or the other way round.
 */
export function birthYearInGroup(
    group: Pick<RecruitmentAgeCategory, "min_birth_year" | "max_birth_year">,
    birthYear: number,
): boolean {
    if (group.min_birth_year != null && group.min_birth_year > birthYear) return false
    if (group.max_birth_year != null && group.max_birth_year < birthYear) return false
    return true
}

// ── Category × centre × gender ──────────────────────
//
// A category says WHO a player applies as and WHERE that runs, and the two
// pickers in the apply modal have to agree with each other. EMPTY MEANS ALL
// on both sides — a category with no `session_ids` runs at every centre, and
// that is the common case these helpers are shaped around.

/**
 * The categories on offer at ONE centre: every category that either runs
 * everywhere or names this one.
 *
 * Mirrors the server's refusal (`_check_category_runs_at`) so the modal never
 * offers a pair the apply endpoint would reject.
 */
export function categoriesForSession<
    T extends Pick<RecruitmentAgeCategory, "session_ids">,
>(groups: T[] | undefined, sessionId: string): T[] {
    if (!groups) return []
    if (!sessionId) return groups
    return groups.filter(group => {
        const ids = group.session_ids ?? []
        return ids.length === 0 || ids.includes(sessionId)
    })
}

/** The centres ONE category is held at — every one of them when it names none. */
export function sessionsForCategory<T extends { id: string }>(
    sessions: T[] | undefined,
    group: Pick<RecruitmentAgeCategory, "session_ids"> | undefined,
): T[] {
    if (!sessions) return []
    const ids = group?.session_ids ?? []
    if (ids.length === 0) return sessions
    return sessions.filter(session => ids.includes(session.id))
}

/**
 * Anything that may name a gender — a published category, or the lighter one
 * an APPLICATION carries. Optional rather than nullable because a payload
 * cached before the field shipped has no key at all, and an absent gender
 * means the same thing as a null one: inherit the trial's.
 */
type GenderBearing = { gender?: RecruitmentGender | null }

/**
 * The gender a category is actually for: its own, or — the common case,
 * where it sets none — the trial's.
 *
 * The same fallback the server reads (`effective_genders`), so the word this
 * shows a player is the word the org's own eligibility badge uses.
 */
export function effectiveGender(
    group: GenderBearing | undefined,
    recruitmentGender: RecruitmentGender | "" | null | undefined,
): RecruitmentGender | "" {
    return group?.gender ?? (recruitmentGender || "")
}

/** "Boys" / "Girls" / "Any" — how a gender reads on a category. */
export function genderLabel(gender: RecruitmentGender | "" | null | undefined): string {
    if (gender === "male") return "Boys"
    if (gender === "female") return "Girls"
    return "Any"
}

/** Whether a title already names the gender, however the org worded it. */
function titleNamesGender(title: string): boolean {
    return /(boys|girls|men|women)/i.test(title)
}

/**
 * The gender word to ADD to a label, or "" when there is none to add.
 *
 * Nothing for a category open to everyone, and nothing when the title
 * already says it — "U15 Girls · Girls" is noise, and the org's own wording
 * ("Women's U21", "Boys only") counts as saying it.
 */
function addedGenderWord(
    group: GenderBearing & { title: string },
    recruitmentGender: RecruitmentGender | "" | null | undefined,
): string {
    const effective = effectiveGender(group, recruitmentGender)
    if (effective !== "male" && effective !== "female") return ""
    if (titleNamesGender(group.title)) return ""
    return genderLabel(effective)
}

/**
 * WHETHER A CATEGORY TAKES THIS PLAYER — for a warning, never a gate.
 *
 * "Unknown passes", exactly as the backend has it: no profile gender is not a
 * mismatch, and neither is a category open to everyone. The only false this
 * returns is a known gender against a category that names the other one, and
 * even then the modal asks the player to confirm rather than refusing them.
 */
export function genderFitsGroup(
    group: GenderBearing | undefined,
    recruitmentGender: RecruitmentGender | "" | null | undefined,
    viewerGender: string | null | undefined,
): boolean {
    if (!viewerGender) return true
    const effective = effectiveGender(group, recruitmentGender)
    if (!effective || effective === "all") return true
    return effective === viewerGender
}

/**
 * The option label in the apply modal's category select.
 *
 * "U15 · Girls · born 2011–2012 · report 8:30 AM". The gender sits second
 * because it is the half of the choice the player is most likely to get
 * wrong on a split trial — and it is only there when it says something new
 * (see `addedGenderWord`).
 */
export function ageGroupOptionLabel(
    group: RecruitmentAgeCategory,
    recruitmentGender?: RecruitmentGender | "" | null,
): string {
    const range = formatBirthYears(group.min_birth_year, group.max_birth_year)
    const time = group.reporting_time
        ? `report ${formatReportingTime(group.reporting_time)}`
        : ""
    const detail = [addedGenderWord(group, recruitmentGender), range, time]
        .filter(Boolean)
        .join(" · ")
    return detail ? `${group.title} — ${detail}` : group.title
}

/**
 * The gender word on its own, for a surface that lays its own detail out
 * (the detail pages' "Who can come" list, the centre chips). Same rule as
 * the option label, so one trial never reads two ways.
 */
export function ageGroupGenderWord(
    group: GenderBearing & { title: string },
    recruitmentGender?: RecruitmentGender | "" | null,
): string {
    return addedGenderWord(group, recruitmentGender)
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
