/**
 * Match diary API (backend: /matches/).
 *
 * Uses the shared axios instance, so every call already carries the JWT and the
 * active actor headers. Responses are unwrapped from the standard envelope
 * (`res.data.data`) and parsed through the feature schemas.
 *
 * ACTOR MATTERS. Every endpoint here is player-only and self-scoped: the server
 * refuses an organization actor outright (403, "Switch to your personal
 * account…") and refuses a coach or scout by role. There is no id or username
 * in any of the owner routes, so there is nothing to get wrong beyond being on
 * the right side of the AccountSwitcher. The one exception is
 * `fetchPlayerMatchSummaryApi`, which reads somebody ELSE's showcased summary.
 *
 * NOTE ON PATHS: none of these end in a slash. In production the client talks
 * to /api/<path> and Vercel rewrites it; a trailing slash 308s to the
 * slash-less form, Django APPEND_SLASHes back with a path-only Location, and
 * the browser resolves that against the frontend origin — the /api prefix is
 * gone and the call lands on the Next.js 404 page.
 */

import { isAxiosError } from "axios"
import { z } from "zod"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
    matchDiarySettingsSchema,
    matchEntrySchema,
    matchListSchema,
    matchStatFieldListSchema,
    matchSummarySchema,
    playerMatchSummarySchema,
    upcomingMatchListSchema,
    type MatchDiarySettings,
    type MatchEntry,
    type MatchEntryFormValues,
    type MatchList,
    type MatchResult,
    type MatchStatFieldList,
    type MatchStatus,
    type MatchSummary,
    type MatchType,
    type PlayerMatchSummary,
    type UpcomingMatchList,
} from "../types"

const BASE = "/matches"

// ── Payloads ──────────────────────────────────────────────────

/** One stat on the way in. The server names the key `stat_field_id`. */
export type MatchStatPayload = {
    stat_field_id: string
    value: number
}

export type CreateMatchPayload = {
    sport: string
    /** ISO date, `YYYY-MM-DD`. */
    date: string
    status?: MatchStatus
    kickoff_time?: string | null
    opponent_name?: string
    match_type?: MatchType
    result?: MatchResult
    minutes_played?: number | null
    position?: string | null
    self_rating?: number | null
    notes?: string
    career_entry?: string | null
    photo_url?: string
    photo_public_id?: string
    stats?: MatchStatPayload[]
}

/**
 * PATCH body. Every field is optional and the server distinguishes "absent"
 * from "sent as null" — most sharply on `stats`:
 *   - omit `stats`        → leave the logged stats exactly as they are
 *   - send an array       → REPLACE the whole set with it
 *   - send `[]`           → clear them
 * `undefined` keys are dropped by JSON serialization, which is exactly the
 * "absent" case, so a partial object here does the right thing.
 */
export type UpdateMatchPayload = Partial<CreateMatchPayload>

export type MatchDiarySettingsPatch = {
    showcase_summary?: boolean
}

export type FetchMatchesParams = {
    status?: MatchStatus
    year?: number
    sport_id?: string
    limit?: number
    offset?: number
}

// ── Form → payload ────────────────────────────────────────────

/**
 * A form value that may be blank → the number or null the API expects.
 * `Number("")` is 0, which would quietly log a 0-minute match, so the blank
 * check has to come first.
 */
const optionalNumber = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * Only the stats the player actually filled in. A blank input is "not logged",
 * which is a genuinely different fact from a logged zero — the summary counts
 * the two separately (`zero_count` is what makes clean sheets work), so
 * sending 0 for every untouched field would fabricate clean sheets nobody kept.
 */
const filledStats = (
    stats: MatchEntryFormValues["stats"]
): MatchStatPayload[] =>
    stats
        .filter((stat) => stat.value.trim() !== "")
        .map((stat) => ({
            stat_field_id: stat.stat_field_id,
            value: Number(stat.value),
        }))

/**
 * Turn form values into a create body.
 *
 * A SCHEDULED match is sent stripped: the form's superRefine already refuses a
 * fixture carrying a result, but a client that somehow got past it would be
 * rejected by the server AND by a database constraint, and a 400 the user
 * cannot act on is worse than sending what a fixture actually is.
 */
export const toCreateMatchPayload = (
    values: MatchEntryFormValues
): CreateMatchPayload => {
    const scheduled = values.status === "scheduled"

    return {
        sport: values.sport,
        date: values.date,
        status: values.status,
        kickoff_time: values.kickoff_time || null,
        opponent_name: values.opponent_name.trim(),
        match_type: values.match_type,
        result: scheduled ? "na" : values.result,
        minutes_played: scheduled ? null : optionalNumber(values.minutes_played),
        position: values.position || null,
        self_rating: scheduled ? null : values.self_rating,
        notes: values.notes.trim(),
        career_entry: values.career_entry || null,
        ...(values.photo_url && values.photo_public_id
            ? {
                photo_url: values.photo_url,
                photo_public_id: values.photo_public_id,
            }
            : {}),
        stats: scheduled ? [] : filledStats(values.stats),
    }
}

/**
 * Turn form values into a PATCH body — the WHOLE form, not a diff.
 *
 * This is what makes promotion one call: a fixture opened in the form and
 * submitted as played carries `status`, `result`, `minutes_played`,
 * `self_rating` and `stats` together, which is exactly what the server's
 * single-PATCH promotion path expects.
 *
 * `photo_url`/`photo_public_id` are omitted unless the player uploaded a NEW
 * photo in this edit. The server requires both keys together and never sends
 * the public_id back, so echoing a stale pair would be rejected — and sending
 * blanks would silently delete the existing photo.
 */
export const toUpdateMatchPayload = (
    values: MatchEntryFormValues
): UpdateMatchPayload => toCreateMatchPayload(values)

/**
 * The same PATCH body with named keys REMOVED.
 *
 * For the one flow where the client does not hold the whole match: promoting a
 * fixture straight from the "Up next" strip, whose `UpcomingMatch` shape has no
 * notes, career stint or photo. The form is seeded with blanks for those, and
 * blanks would erase whatever the row actually had.
 *
 * PATCH's absent-vs-null distinction is exactly the tool for it — an absent key
 * means "leave it alone" — so the fix is to drop the keys rather than to guess
 * at their values. `undefined` would not do: `toCreateMatchPayload` sets them
 * explicitly, and the point is that they never reach the wire at all.
 */
export const toPartialUpdateMatchPayload = (
    values: MatchEntryFormValues,
    omit: readonly (keyof UpdateMatchPayload)[]
): UpdateMatchPayload => {
    const payload: UpdateMatchPayload = toCreateMatchPayload(values)
    for (const key of omit) delete payload[key]
    return payload
}

// ── Calls: the owner's own diary ──────────────────────────────

/** The signed-in player's diary, newest match first. */
export const fetchMatchesApi = async (
    params: FetchMatchesParams = {}
): Promise<MatchList> => {
    const res = await api.get(`${BASE}/list`, {
        params: {
            ...(params.status ? { status: params.status } : {}),
            ...(params.year ? { year: params.year } : {}),
            ...(params.sport_id ? { sport_id: params.sport_id } : {}),
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.offset ? { offset: params.offset } : {}),
        },
    })
    return matchListSchema.parse(res.data.data)
}

/**
 * Fixtures, NEXT ONE FIRST — the opposite order to the diary.
 *
 * Deliberately still includes fixtures whose date has passed, flagged
 * `is_overdue`. Those are the whole point: an unlogged fixture is the one
 * thing that reliably brings a player back to the diary.
 */
export const fetchUpcomingMatchesApi = async (
    limit?: number
): Promise<UpcomingMatchList> => {
    const res = await api.get(`${BASE}/upcoming`, {
        params: limit !== undefined ? { limit } : undefined,
    })
    return upcomingMatchListSchema.parse(res.data.data)
}

export const fetchMatchSummaryApi = async (params: {
    year?: number
    sport_id?: string
} = {}): Promise<MatchSummary> => {
    const res = await api.get(`${BASE}/summary`, {
        params: {
            ...(params.year ? { year: params.year } : {}),
            ...(params.sport_id ? { sport_id: params.sport_id } : {}),
        },
    })
    return matchSummarySchema.parse(res.data.data)
}

/**
 * Another player's summary, when they have switched their showcase on.
 *
 * 404 covers every refusal — showcase off, not a player, deactivated, typo —
 * and that is deliberate server-side, so there is nothing here that can tell
 * them apart either. Treat a 404 as "no summary to show", not as an error.
 */
export const fetchPlayerMatchSummaryApi = async (
    username: string,
    params: { year?: number; sport_id?: string } = {}
): Promise<PlayerMatchSummary> => {
    const res = await api.get(
        `${BASE}/summary/${encodeURIComponent(username)}`,
        {
            params: {
                ...(params.year ? { year: params.year } : {}),
                ...(params.sport_id ? { sport_id: params.sport_id } : {}),
            },
        }
    )
    return playerMatchSummarySchema.parse(res.data.data)
}

/** The stats a player can log for one sport — what the quick-add form is built from. */
export const fetchMatchStatFieldsApi = async (
    sportId: string
): Promise<MatchStatFieldList> => {
    const res = await api.get(`${BASE}/stat-fields`, {
        params: { sport_id: sportId },
    })
    return matchStatFieldListSchema.parse(res.data.data)
}

export const createMatchApi = async (
    payload: CreateMatchPayload
): Promise<MatchEntry> => {
    const res = await api.post(`${BASE}/create`, payload)
    return matchEntrySchema.parse(res.data.data)
}

export const updateMatchApi = async (
    matchId: string,
    payload: UpdateMatchPayload
): Promise<MatchEntry> => {
    const res = await api.patch(`${BASE}/${matchId}/update`, payload)
    return matchEntrySchema.parse(res.data.data)
}

/** Soft delete — the row survives server-side, but nothing reads it back. */
export const deleteMatchApi = async (matchId: string): Promise<void> => {
    await api.delete(`${BASE}/${matchId}`)
}

// ── Calls: settings ───────────────────────────────────────────

/**
 * The player's diary settings.
 *
 * NOTE: this GET get-or-creates the row server-side, so it writes on first
 * call. Fine for a settings screen the owner opened on purpose; do not fire it
 * speculatively for someone who merely looked at a profile.
 */
export const fetchMatchDiarySettingsApi =
    async (): Promise<MatchDiarySettings> => {
        const res = await api.get(`${BASE}/settings`)
        return matchDiarySettingsSchema.parse(res.data.data)
    }

export const updateMatchDiarySettingsApi = async (
    patch: MatchDiarySettingsPatch
): Promise<MatchDiarySettings> => {
    const res = await api.patch(`${BASE}/settings`, patch)
    return matchDiarySettingsSchema.parse(res.data.data)
}

// ── Error copy ────────────────────────────────────────────────

/**
 * The backend already writes human error messages ("A scheduled match cannot
 * have a result. Add those when you mark it as played.", "Only players have a
 * match diary. Your account role is coach."), so this passes them through and
 * only supplies a diary-flavoured fallback.
 *
 * Two things are deliberately NEVER shown to a user:
 *   - axios's own "Request failed with status code 404" (getApiErrorMessage
 *     already refuses to return it — a bare 404 means our routing is wrong,
 *     which is not something the user can act on)
 *   - a Zod parse failure, whose message is a multi-line JSON dump. A response
 *     that doesn't match the schema is a wiring bug; the user gets the fallback
 *     and we keep the detail in the console.
 */
export const getMatchDiaryErrorMessage = (
    err: unknown,
    fallback = "Something went wrong with your match diary. Please try again."
): string => {
    if (err instanceof z.ZodError) return fallback
    return getApiErrorMessage(err, fallback)
}

/** True for the 403 a coach, a scout or an org actor gets on every endpoint. */
export const isMatchDiaryForbidden = (err: unknown): boolean =>
    isAxiosError(err) && err.response?.status === 403

/**
 * Retry policy for the diary's reads.
 *
 * A 4xx here is a settled answer — the wrong role, a filter the server refused,
 * a diary that is not showcased — and retrying it three times only delays the
 * message the user needs to read. Everything else (a dropped connection, a 5xx)
 * gets the usual couple of attempts.
 */
export const retryMatchDiaryQuery = (failureCount: number, err: unknown) => {
    if (isAxiosError(err)) {
        const status = err.response?.status
        if (status && status >= 400 && status < 500) return false
    }
    return failureCount < 2
}
