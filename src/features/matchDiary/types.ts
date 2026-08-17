/**
 * Match diary — types + response schemas.
 *
 * The response schemas mirror `matches/serializers/`. They guard the SHAPE of
 * what the API returns (so a backend change surfaces here, loudly, instead of
 * as `undefined` deep inside a component) — they are not a second copy of the
 * server's business rules.
 *
 * The FORM schema at the bottom is different in kind: it re-states the server's
 * rules on purpose, so a player is told a fixture cannot carry a result before
 * a round trip. The server still enforces all of it — this only moves the
 * message earlier.
 *
 * `visibility` IS NOT IN ANY SCHEMA HERE, and must not be added. The column
 * exists server-side so the diary can open up to followers later without a
 * migration, but v1 never sends it and the write serializers do not accept it.
 * Adding it here would be the first step towards a client that thinks it can
 * publish a diary somebody logged believing it was private.
 */

import { z } from "zod"

// ── Enums (mirror the model's TextChoices) ────────────────────

export const MATCH_STATUSES = ["scheduled", "played"] as const

export type MatchStatus = (typeof MATCH_STATUSES)[number]

export const DEFAULT_MATCH_STATUS: MatchStatus = "played"

export const MATCH_TYPES = [
    "league",
    "tournament",
    "friendly",
    "school_college",
    "practice",
    "other",
] as const

export type MatchType = (typeof MATCH_TYPES)[number]

export const DEFAULT_MATCH_TYPE: MatchType = "other"

export const MATCH_RESULTS = ["win", "loss", "draw", "na"] as const

export type MatchResult = (typeof MATCH_RESULTS)[number]

export const DEFAULT_MATCH_RESULT: MatchResult = "na"

export const STAT_VALUE_TYPES = ["integer", "decimal"] as const

export type StatValueType = (typeof STAT_VALUE_TYPES)[number]

// ── Server limits, mirrored ───────────────────────────────────

/** Server rule: the `opponent_name` column width. */
export const MAX_OPPONENT_NAME_LENGTH = 150

/**
 * NOT a mirrored server rule — `MatchEntry.notes` is a TextField with no
 * length limit at all. This is a UI guardrail: a diary note is a couple of
 * lines about a game, and an input that will silently accept a pasted novel is
 * a worse experience than one that says when to stop. Raise it freely; nothing
 * server-side will disagree.
 */
export const MAX_NOTES_LENGTH = 2000

/** Server rule: the `match_entry_valid_self_rating` check constraint. */
export const SELF_RATING_MIN = 1
export const SELF_RATING_MAX = 5

/** Server rule: `MatchListAPIView.DEFAULT_PAGE_SIZE`. */
export const MATCH_PAGE_SIZE = 20

/** Server rule: `MatchService.MAX_STAT_VALUE` (DecimalField(8, 2)). */
export const MAX_STAT_VALUE = 999999.99

/** How many fixtures the "Up next" strip asks for. */
export const UPCOMING_LIMIT = 5

/** Server rule: `summary_selectors.FORM_LENGTH` — how long `form` can be. */
export const FORM_LENGTH = 10

// ── Shared scalars ────────────────────────────────────────────

/**
 * A DRF DecimalField as it arrives on the wire.
 *
 * DRF's COERCE_DECIMAL_TO_STRING is on by default, so these land as strings
 * ("2.00") rather than numbers. Accepting BOTH and normalizing to a number
 * means flipping that setting server-side does not silently break every stat
 * on the page. Formatting for display is `formatStatValue` in the meta module,
 * which needs the `value_type` to know whether to show decimals at all.
 */
const decimalNumber = z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value), "Expected a number")

// ── Nested summaries ──────────────────────────────────────────

export const matchSportSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon_name: z.string(),
    icon_url: z.string(),
})

export type MatchSport = z.infer<typeof matchSportSchema>

export const matchPositionSchema = z.object({
    id: z.string(),
    name: z.string(),
})

export type MatchPosition = z.infer<typeof matchPositionSchema>

/**
 * The career stint a match hangs off — four fields, enough for a row to say
 * "during your spell at Riverside FC" without a second request. Null when the
 * player did not attach one, which is the common case.
 */
export const matchCareerEntrySchema = z.object({
    id: z.string(),
    title: z.string(),
    organization_name: z.string(),
    verification_status: z.string(),
})

export type MatchCareerEntry = z.infer<typeof matchCareerEntrySchema>

// ── Stat catalog ──────────────────────────────────────────────

/**
 * One loggable stat for one sport. Admin-seeded, never client-written.
 *
 * `position_ids` is empty for a stat that applies to every position, which is
 * how most of them ship. NOTHING filters on it in v1 — the server sends the
 * links early so the form can start using them without a new endpoint.
 */
export const matchStatFieldSchema = z.object({
    id: z.string(),
    name: z.string(),
    short_label: z.string(),
    unit: z.string(),
    value_type: z.enum(STAT_VALUE_TYPES),
    /** The three the quick-add form shows before "add more". */
    is_primary: z.boolean(),
    order: z.number(),
    position_ids: z.array(z.string()),
})

export type MatchStatField = z.infer<typeof matchStatFieldSchema>

export const matchStatFieldListSchema = z.object({
    count: z.number(),
    results: z.array(matchStatFieldSchema),
})

export type MatchStatFieldList = z.infer<typeof matchStatFieldListSchema>

// ── A logged stat ─────────────────────────────────────────────

/**
 * Flattened with its catalog row, because the diary row prints "G 2" and
 * should not have to reach two levels down for a two-character label.
 */
export const matchEntryStatSchema = z.object({
    stat_field_id: z.string(),
    name: z.string(),
    short_label: z.string(),
    unit: z.string(),
    value_type: z.enum(STAT_VALUE_TYPES),
    /** Drives `headlineStat` — which one stat a collapsed row shows. */
    is_primary: z.boolean(),
    value: decimalNumber,
})

export type MatchEntryStat = z.infer<typeof matchEntryStatSchema>

// ── Match entry ───────────────────────────────────────────────

export const matchEntrySchema = z.object({
    id: z.string(),

    sport: matchSportSchema,
    status: z.enum(MATCH_STATUSES),

    /** ISO date, `YYYY-MM-DD`. */
    date: z.string(),
    /** `HH:MM:SS`, or null when the player didn't set one. */
    kickoff_time: z.string().nullable(),

    opponent_name: z.string(),
    match_type: z.enum(MATCH_TYPES),
    result: z.enum(MATCH_RESULTS),

    minutes_played: z.number().nullable(),
    position: matchPositionSchema.nullable(),
    self_rating: z.number().nullable(),
    notes: z.string(),

    career_entry: matchCareerEntrySchema.nullable(),

    /** Blank string, not null, when there is no photo. */
    photo_url: z.string(),

    stats: z.array(matchEntryStatSchema),

    created_at: z.string(),
    updated_at: z.string(),
})

export type MatchEntry = z.infer<typeof matchEntrySchema>

export const matchListSchema = z.object({
    /** Total matching entries, not the page length — drives pagination. */
    count: z.number(),
    limit: z.number(),
    offset: z.number(),
    results: z.array(matchEntrySchema),
})

export type MatchList = z.infer<typeof matchListSchema>

// ── Upcoming fixtures ─────────────────────────────────────────

/**
 * Deliberately lighter than a full entry: a scheduled match cannot have a
 * result, minutes, rating or stats, so returning them as a row of nulls would
 * only invite the UI to render empty chips.
 *
 * `is_overdue` is the field the whole strip exists for — a fixture whose date
 * has passed and that was never logged.
 */
export const upcomingMatchSchema = z.object({
    id: z.string(),
    date: z.string(),
    kickoff_time: z.string().nullable(),
    opponent_name: z.string(),
    match_type: z.enum(MATCH_TYPES),
    sport: matchSportSchema,
    position: matchPositionSchema.nullable(),
    is_overdue: z.boolean(),
})

export type UpcomingMatch = z.infer<typeof upcomingMatchSchema>

export const upcomingMatchListSchema = z.object({
    count: z.number(),
    results: z.array(upcomingMatchSchema),
})

export type UpcomingMatchList = z.infer<typeof upcomingMatchListSchema>

// ── Summary ───────────────────────────────────────────────────

/**
 * One stat's season line.
 *
 * `zero_count` is how many of those matches logged it AS ZERO, which is a
 * different fact from never having logged it. Read off "Goals conceded" it is
 * the clean-sheet number — the backend deliberately knows nothing about clean
 * sheets, so this is where that meaning gets applied.
 */
export const matchSummaryStatSchema = z.object({
    stat_field_id: z.string(),
    name: z.string(),
    short_label: z.string(),
    unit: z.string(),
    value_type: z.enum(STAT_VALUE_TYPES),
    total: decimalNumber,
    entries_count: z.number(),
    zero_count: z.number(),
})

export type MatchSummaryStat = z.infer<typeof matchSummaryStatSchema>

export const matchSummarySchema = z.object({
    total_matches: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number(),
    minutes_total: z.number(),
    /** Null means nobody has rated a match — an empty state, not a zero. */
    average_rating: z.number().nullable(),
    /** Last 10 ratings, OLDEST FIRST, nulls kept so gaps render honestly. */
    form: z.array(z.number().nullable()),
    stats: z.array(matchSummaryStatSchema),
})

export type MatchSummary = z.infer<typeof matchSummarySchema>

/**
 * The same block as somebody else sees it, on `/matches/summary/<username>`.
 * The streak rides along because that is what a visiting coach reads it for.
 */
export const playerMatchSummarySchema = matchSummarySchema.extend({
    username: z.string(),
    current_streak_weeks: z.number(),
    longest_streak_weeks: z.number(),
    is_owner: z.boolean(),
})

export type PlayerMatchSummary = z.infer<typeof playerMatchSummarySchema>

// ── Diary settings ────────────────────────────────────────────

export const matchDiarySettingsSchema = z.object({
    showcase_summary: z.boolean(),
    /** Derived server-side from match dates — never writable. */
    current_streak_weeks: z.number(),
    longest_streak_weeks: z.number(),
    last_logged_at: z.string().nullable(),
    updated_at: z.string(),
})

export type MatchDiarySettings = z.infer<typeof matchDiarySettingsSchema>

// ── List filters ──────────────────────────────────────────────

/**
 * What the filter row produces and the list query keys on. All three are
 * "unset means everything", and they drive SERVER params rather than filtering
 * a loaded page — the list is paginated, so filtering client-side would only
 * ever filter the pages already fetched.
 */
export type MatchListFilters = {
    status?: MatchStatus
    year?: number
    sportId?: string
}

// ── Form schema ───────────────────────────────────────────────

/** `<input type="date">` gives `YYYY-MM-DD`, which also sorts lexicographically. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `<input type="time">` gives `HH:MM`; the API also accepts `HH:MM:SS`. */
const ISO_TIME = /^\d{2}:\d{2}(:\d{2})?$/

/** Digits and nothing else — a whole, non-negative number. */
const WHOLE_NUMBER = /^\d+$/

/**
 * Today as a LOCAL `YYYY-MM-DD`.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is UTC: east of
 * Greenwich that returns YESTERDAY for most of the evening, and a player
 * logging a match at 11pm would be told they cannot have played it yet. The
 * diary's dates are calendar days in the player's own week, so they are read
 * from the local clock.
 */
export const todayIso = (): string => {
    const now = new Date()
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-")
}

/** One stat as the form holds it — the value stays a string while being typed. */
export const matchStatFormSchema = z.object({
    stat_field_id: z.string().min(1),
    /**
     * "" means "not logged" and is dropped by `toCreateMatchPayload`.
     *
     * Whether decimals are allowed is NOT decided here: it depends on the
     * catalog row's `value_type`, which this schema has no access to. The form
     * holds that rule at the keystroke (see `sanitizeStatInput`), and the
     * server holds it for real. What is left here is the part that is true of
     * every stat whatever its type — a number, not negative, inside the
     * column's range.
     */
    value: z.string().superRefine((raw, ctx) => {
        const trimmed = raw.trim()
        if (!trimmed) return

        const parsed = Number(trimmed)

        if (!Number.isFinite(parsed)) {
            ctx.addIssue({ code: "custom", message: "Enter a number" })
            return
        }

        if (parsed < 0) {
            ctx.addIssue({ code: "custom", message: "Can't be negative" })
            return
        }

        if (parsed > MAX_STAT_VALUE) {
            ctx.addIssue({
                code: "custom",
                message: `Keep it under ${MAX_STAT_VALUE}`,
            })
        }
    }),
})

export type MatchStatFormValue = z.infer<typeof matchStatFormSchema>

/**
 * The add/edit form's SHAPE.
 *
 * Empty strings rather than `undefined` for the optional fields, so
 * react-hook-form has a stable controlled value for every input.
 * `toCreateMatchPayload` in the api module is what turns this into a body.
 *
 * The cross-field rules live in `makeMatchEntryFormSchema` below, because two
 * of them need to know whether the entry already exists.
 */
const matchEntryFormBaseSchema = z.object({
    sport: z.string().min(1, "Pick a sport"),

    status: z.enum(MATCH_STATUSES),

    date: z
        .string()
        .min(1, "Add the match date")
        .regex(ISO_DATE, "Enter a valid date"),
    /** "" means no kick-off time was set. */
    kickoff_time: z.union([z.string().regex(ISO_TIME, "Enter a valid time"), z.literal("")]),

    opponent_name: z
        .string()
        .max(
            MAX_OPPONENT_NAME_LENGTH,
            `Keep the opponent under ${MAX_OPPONENT_NAME_LENGTH} characters`
        ),

    match_type: z.enum(MATCH_TYPES),
    result: z.enum(MATCH_RESULTS),

    /**
     * Kept as a string so an emptied number input is "" and not NaN. "" means
     * "not recorded"; the server takes null for that.
     */
    minutes_played: z
        .string()
        .refine(
            (raw) => !raw.trim() || WHOLE_NUMBER.test(raw.trim()),
            "Minutes played has to be a whole number, and not negative"
        ),

    /** A position id, or "" for none. */
    position: z.string(),

    /** null when unrated — a rating widget has a genuine "not set". */
    self_rating: z
        .number()
        .int("Your rating has to be a whole number")
        .min(SELF_RATING_MIN, `Rate the match from ${SELF_RATING_MIN} to ${SELF_RATING_MAX}`)
        .max(SELF_RATING_MAX, `Rate the match from ${SELF_RATING_MIN} to ${SELF_RATING_MAX}`)
        .nullable(),

    notes: z
        .string()
        .max(
            MAX_NOTES_LENGTH,
            `Keep your notes under ${MAX_NOTES_LENGTH} characters`
        ),

    /** A career entry id, or "" for none. */
    career_entry: z.string(),

    photo_url: z.string(),
    photo_public_id: z.string(),

    stats: z.array(matchStatFormSchema),
})

export type MatchEntryFormValues = z.infer<typeof matchEntryFormBaseSchema>

export type MatchEntryFormContext = {
    /**
     * True when the form was opened on a fixture that ALREADY EXISTS.
     *
     * This exists for one case, and it is the case the whole feature is built
     * around: an OVERDUE fixture. Its date is in the past by definition — that
     * is what makes it overdue — so the "a fixture cannot be in the past" rule
     * would refuse to save the very rows the diary keeps asking the player to
     * come back and log. The rule is a guardrail for somebody SCHEDULING a
     * match, and it is only applied there.
     */
    isExistingFixture?: boolean
}

/**
 * The add/edit form's rules.
 *
 * Two kinds of rule live here and it is worth knowing which is which.
 *
 * MIRRORED FROM THE SERVER — a SCHEDULED match cannot carry a result, minutes,
 * a rating or stats. `MatchService._assert_scheduled_is_blank` refuses it and
 * so does the `match_entry_scheduled_has_no_result` constraint. Re-stating it
 * here only moves the message earlier.
 *
 * NOT A SERVER RULE — the two date checks. The API will happily accept a match
 * played next Tuesday; these are the client saying "you probably meant the
 * other mode", and they name the mode in the message rather than just refusing.
 * Nothing breaks server-side if they are ever relaxed.
 */
export const makeMatchEntryFormSchema = (
    context: MatchEntryFormContext = {}
) =>
    matchEntryFormBaseSchema.superRefine((values, ctx) => {
        const today = todayIso()
        // A malformed date already has its own message; comparing it as a
        // string would only stack a second, more confusing one on top.
        const dateIsUsable = ISO_DATE.test(values.date)

        if (values.status !== "scheduled") {
            if (dateIsUsable && values.date > today) {
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message:
                        "That's in the future — switch to Upcoming to add it as a fixture",
                })
            }
            return
        }

        if (
            dateIsUsable &&
            !context.isExistingFixture &&
            values.date < today
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["date"],
                message:
                    "That's in the past — switch to Played to log a match you've played",
            })
        }

        if (values.result !== "na") {
            ctx.addIssue({
                code: "custom",
                path: ["result"],
                message: "A scheduled match has no result yet",
            })
        }

        if (values.minutes_played.trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["minutes_played"],
                message: "Add minutes once you've played this match",
            })
        }

        if (values.self_rating !== null) {
            ctx.addIssue({
                code: "custom",
                path: ["self_rating"],
                message: "Rate the match once you've played it",
            })
        }

        if (values.stats.some((stat) => stat.value.trim())) {
            ctx.addIssue({
                code: "custom",
                path: ["stats"],
                message: "Add stats once you've played this match",
            })
        }
    })

/** The rules as they apply to a NEW entry. */
export const matchEntryFormSchema = makeMatchEntryFormSchema()

/** A blank form — also the shape `reset()` takes when logging a new match. */
export const emptyMatchEntryForm = (
    overrides: Partial<MatchEntryFormValues> = {}
): MatchEntryFormValues => ({
    sport: "",
    status: DEFAULT_MATCH_STATUS,
    date: "",
    kickoff_time: "",
    opponent_name: "",
    match_type: DEFAULT_MATCH_TYPE,
    result: DEFAULT_MATCH_RESULT,
    minutes_played: "",
    position: "",
    self_rating: null,
    notes: "",
    career_entry: "",
    photo_url: "",
    photo_public_id: "",
    stats: [],
    ...overrides,
})

/**
 * Fill the form from an existing entry, for the edit flow — including the
 * promote-a-fixture flow, where the form opens on a SCHEDULED entry and the
 * player flips it to played in the same submission.
 */
export const matchEntryToForm = (entry: MatchEntry): MatchEntryFormValues => ({
    sport: entry.sport.id,
    status: entry.status,
    date: entry.date,
    // The API sends HH:MM:SS; <input type="time"> wants HH:MM.
    kickoff_time: entry.kickoff_time ? entry.kickoff_time.slice(0, 5) : "",
    opponent_name: entry.opponent_name,
    match_type: entry.match_type,
    result: entry.result,
    minutes_played:
        entry.minutes_played === null ? "" : String(entry.minutes_played),
    position: entry.position?.id ?? "",
    self_rating: entry.self_rating,
    notes: entry.notes,
    career_entry: entry.career_entry?.id ?? "",
    photo_url: entry.photo_url,
    // Never sent back to the client — the edit form only carries a public_id
    // when the player uploads a NEW photo during this edit.
    photo_public_id: "",
    stats: entry.stats.map((stat) => ({
        stat_field_id: stat.stat_field_id,
        value: String(stat.value),
    })),
})

/**
 * Fill the form from an "Up next" fixture, for the promote flow started from
 * the overdue strip.
 *
 * `UpcomingMatch` is deliberately lighter than a full entry, and this is where
 * that costs something: it carries no notes, career stint or photo, so a form
 * seeded from it holds BLANKS for three fields the row may well have. Sending
 * those blanks back would wipe them — which is why the sheet omits any of them
 * the player did not touch from the PATCH (see `toPartialUpdateMatchPayload`).
 *
 * Everything a fixture CAN'T have — result, minutes, rating, stats — is blank
 * here because it is blank server-side too, so those are safe to send.
 */
export const upcomingMatchToForm = (
    fixture: UpcomingMatch
): MatchEntryFormValues =>
    emptyMatchEntryForm({
        sport: fixture.sport.id,
        status: "scheduled",
        date: fixture.date,
        kickoff_time: fixture.kickoff_time
            ? fixture.kickoff_time.slice(0, 5)
            : "",
        opponent_name: fixture.opponent_name,
        match_type: fixture.match_type,
        position: fixture.position?.id ?? "",
    })
