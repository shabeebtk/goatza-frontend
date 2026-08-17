"use client"

/**
 * React Query bindings for the match diary.
 *
 * Everything owner-side is self-scoped — the API takes no id and no username on
 * the owner routes — so the keys carry filters, not user ids. The one exception
 * is `playerSummary(username)`, which reads somebody else's showcased summary.
 *
 * THE CACHE RULE THAT MATTERS: a played match feeds three different surfaces
 * that would otherwise disagree. The list shows the entry, the summary shows
 * the totals it moved, and the settings row shows the streak it may have
 * extended — all three are recomputed server-side on every write, so all three
 * are invalidated together. Getting this wrong does not throw; it just leaves a
 * player looking at a diary that says one thing and a streak that says another,
 * which is worse than an error because nobody reports it.
 *
 * Promotion is the case to keep in mind: a fixture becoming a played match
 * LEAVES `upcoming` and JOINS the list, in one PATCH. Neither side can be
 * skipped on the grounds that "it was only an edit".
 *
 * Error toasts use the shared sonner + getMatchDiaryErrorMessage pattern;
 * success toasts are left to the calling component, which knows the context the
 * message should read in.
 */

import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
    createMatchApi,
    deleteMatchApi,
    fetchMatchDiarySettingsApi,
    fetchMatchStatFieldsApi,
    fetchMatchSummaryApi,
    fetchMatchesApi,
    fetchPlayerMatchSummaryApi,
    fetchUpcomingMatchesApi,
    getMatchDiaryErrorMessage,
    retryMatchDiaryQuery,
    updateMatchApi,
    updateMatchDiarySettingsApi,
    type CreateMatchPayload,
    type MatchDiarySettingsPatch,
    type UpdateMatchPayload,
} from "../services/matches.api"
import {
    MATCH_PAGE_SIZE,
    UPCOMING_LIMIT,
    type MatchDiarySettings,
    type MatchList,
    type MatchListFilters,
} from "../types"

// ── Query keys ────────────────────────────────────────────────

export const matchDiaryKeys = {
    all: ["matchDiary"] as const,
    lists: () => ["matchDiary", "list"] as const,
    list: (filters: MatchListFilters) =>
        ["matchDiary", "list", filters] as const,
    upcoming: () => ["matchDiary", "upcoming"] as const,
    summaries: () => ["matchDiary", "summary"] as const,
    summary: (filters: Omit<MatchListFilters, "status"> = {}) =>
        ["matchDiary", "summary", filters] as const,
    playerSummary: (
        username: string,
        filters: Omit<MatchListFilters, "status"> = {}
    ) => ["matchDiary", "summary", "player", username, filters] as const,
    settings: () => ["matchDiary", "settings"] as const,
    statFields: (sportId: string) =>
        ["matchDiary", "stat-fields", sportId] as const,
}

// ── Shared cache helpers ──────────────────────────────────────

/**
 * Every surface a write can move.
 *
 * `lists()` rather than one filtered key: the same match can belong to several
 * cached filter combinations (all years, this year, this sport), and there is
 * no way to know from here which of them the entry now qualifies for — a PATCH
 * that changed the date has moved it between years.
 */
const invalidateAfterMatchWrite = (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: matchDiaryKeys.lists() })
    qc.invalidateQueries({ queryKey: matchDiaryKeys.upcoming() })
    qc.invalidateQueries({ queryKey: matchDiaryKeys.summaries() })
    // The streak lives on the settings row and is recomputed on every write.
    qc.invalidateQueries({ queryKey: matchDiaryKeys.settings() })
}

// ── Queries ───────────────────────────────────────────────────

/**
 * The signed-in player's diary, paginated.
 *
 * Filters are SERVER params, not a client-side `.filter()`. The list is paged,
 * so filtering what has already been fetched would silently hide matches that
 * simply had not loaded yet — and the count in the response would disagree with
 * the rows on screen.
 */
export const useMatches = (
    filters: MatchListFilters = {},
    options?: { enabled?: boolean }
) =>
    useInfiniteQuery<MatchList, Error>({
        queryKey: matchDiaryKeys.list(filters),
        queryFn: ({ pageParam }) =>
            fetchMatchesApi({
                status: filters.status,
                year: filters.year,
                sport_id: filters.sportId,
                limit: MATCH_PAGE_SIZE,
                offset: pageParam as number,
            }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const fetched = allPages.reduce(
                (sum, page) => sum + page.results.length,
                0
            )
            return fetched < lastPage.count ? fetched : undefined
        },
        // Opt-out, for the callers that render on somebody ELSE's page. This
        // route is self-scoped, so leaving it on there would not leak anything
        // — it would quietly fetch the VIEWER's own diary while they look at a
        // stranger's profile, which is a request with no reader.
        enabled: options?.enabled ?? true,
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60,
    })

/**
 * Fixtures, next first.
 *
 * Short staleTime because `is_overdue` is computed against TODAY server-side:
 * a cached fixture that went overdue overnight would otherwise keep rendering
 * as a normal upcoming match, and the overdue strip is the single thing on this
 * page that brings a player back.
 */
export const useUpcomingMatches = (
    limit: number = UPCOMING_LIMIT,
    options?: { enabled?: boolean }
) =>
    useQuery({
        queryKey: matchDiaryKeys.upcoming(),
        queryFn: () => fetchUpcomingMatchesApi(limit),
        // Same opt-out, same reason, as `useMatches`.
        enabled: options?.enabled ?? true,
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60,
    })

export const useMatchSummary = (
    filters: Omit<MatchListFilters, "status"> = {},
    options?: { enabled?: boolean }
) =>
    useQuery({
        queryKey: matchDiaryKeys.summary(filters),
        queryFn: () =>
            fetchMatchSummaryApi({
                year: filters.year,
                sport_id: filters.sportId,
            }),
        enabled: options?.enabled ?? true,
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60,
    })

/**
 * One player's showcased summary, by username.
 *
 * A 404 here is the normal answer for "this player has not switched their
 * showcase on", not a failure — and it is deliberately indistinguishable from
 * an unknown username server-side. `retryMatchDiaryQuery` stops it being
 * retried, and the caller should render nothing rather than an error.
 *
 * ALSO THE OWNER'S OWN ROUTE, and deliberately so. The endpoint short-circuits
 * the showcase flag for the owner (`get_showcase_user`), and it returns the
 * streak alongside the totals — so the profile card can be one request and one
 * code path for the owner and a visitor alike, instead of the owner needing
 * `useMatchSummary` plus `useMatchDiarySettings` and a second card to render
 * them. That also avoids the settings GET, which writes a row on first call.
 */
export const usePlayerMatchSummary = (
    username?: string | null,
    filters: Omit<MatchListFilters, "status"> = {},
    options?: { enabled?: boolean }
) =>
    useQuery({
        queryKey: matchDiaryKeys.playerSummary(username ?? "", filters),
        queryFn: () =>
            fetchPlayerMatchSummaryApi(username as string, {
                year: filters.year,
                sport_id: filters.sportId,
            }),
        enabled: Boolean(username) && (options?.enabled ?? true),
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60 * 5,
    })

/**
 * The stat catalog for one sport.
 *
 * An HOUR of staleTime, far longer than anything else here, because this is
 * CATALOG data: it changes when an admin seeds a new sport, never as a result
 * of anything a player does. Refetching it while somebody fills in a form would
 * be pure noise.
 */
export const useMatchStatFields = (
    sportId?: string | null,
    enabled = true
) =>
    useQuery({
        queryKey: matchDiaryKeys.statFields(sportId ?? ""),
        queryFn: () => fetchMatchStatFieldsApi(sportId as string),
        enabled: Boolean(sportId) && enabled,
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60 * 60,
    })

/**
 * The player's own diary settings — the showcase toggle and the streak.
 *
 * `enabled` is opt-out because the GET get-or-creates the row server-side:
 * firing it for someone who merely landed on a page would write a settings row
 * for a player who has never opened the diary.
 */
export const useMatchDiarySettings = (enabled = true) =>
    useQuery({
        queryKey: matchDiaryKeys.settings(),
        queryFn: fetchMatchDiarySettingsApi,
        enabled,
        retry: retryMatchDiaryQuery,
        staleTime: 1000 * 60 * 5,
    })

// ── Mutations ─────────────────────────────────────────────────

/**
 * Log a match, or schedule a fixture.
 *
 * Not optimistic. The server decides the entry's final shape in ways the client
 * cannot predict — the stats come back joined to their catalog rows, and a
 * played entry may have moved the streak — so writing a guess into the list
 * would mean rendering a row that changes under the user a moment later.
 */
export const useCreateMatch = () => {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: (payload: CreateMatchPayload) => createMatchApi(payload),

        onError: (err) => {
            toast.error(getMatchDiaryErrorMessage(err))
        },

        onSettled: () => {
            invalidateAfterMatchWrite(qc)
        },
    })
}

/**
 * Edit a match — including promoting a fixture to played, which is this same
 * call carrying `status`, `result`, `minutes_played`, `self_rating` and
 * `stats` together.
 *
 * That is exactly why this invalidates `upcoming` as well as the list: the
 * entry the player just filled in has left the fixture strip, and a stale
 * `upcoming` would keep telling them to log a match they have already logged.
 */
export const useUpdateMatch = () => {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: ({
            matchId,
            payload,
        }: {
            matchId: string
            payload: UpdateMatchPayload
        }) => updateMatchApi(matchId, payload),

        onError: (err) => {
            toast.error(getMatchDiaryErrorMessage(err))
        },

        onSettled: () => {
            invalidateAfterMatchWrite(qc)
        },
    })
}

/**
 * Remove a match.
 *
 * Optimistic on the LIST only. Pulling the row immediately is what a delete
 * should feel like and it is trivially reversible on error, but the summary and
 * the streak are recomputed server-side from the whole history — guessing what
 * they become would mean showing a total that is subtly wrong, and a wrong
 * total is not something a user can spot and correct.
 */
export const useDeleteMatch = () => {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: (matchId: string) => deleteMatchApi(matchId),

        onMutate: async (matchId) => {
            await qc.cancelQueries({ queryKey: matchDiaryKeys.lists() })

            const snapshots = qc.getQueriesData<{
                pages: MatchList[]
                pageParams: unknown[]
            }>({ queryKey: matchDiaryKeys.lists() })

            for (const [key] of snapshots) {
                qc.setQueryData<{ pages: MatchList[]; pageParams: unknown[] }>(
                    key,
                    (old) =>
                        old
                            ? {
                                ...old,
                                pages: old.pages.map((page) => ({
                                    ...page,
                                    count: Math.max(0, page.count - 1),
                                    results: page.results.filter(
                                        (entry) => entry.id !== matchId
                                    ),
                                })),
                            }
                            : old
                )
            }

            return { snapshots }
        },

        onError: (err, _matchId, ctx) => {
            for (const [key, data] of ctx?.snapshots ?? []) {
                qc.setQueryData(key, data)
            }
            toast.error(getMatchDiaryErrorMessage(err))
        },

        onSettled: () => {
            invalidateAfterMatchWrite(qc)
        },
    })
}

/**
 * Flip the showcase toggle.
 *
 * Optimistic with rollback, exactly as `useUpdateCVSettings` does it and for
 * the same reason: a switch that waits for a round trip before moving feels
 * broken, and this write is trivially reversible. The streak fields are left
 * alone in the optimistic patch — they are derived, and this endpoint cannot
 * change them.
 */
export const useUpdateMatchDiarySettings = () => {
    const qc = useQueryClient()
    const key = matchDiaryKeys.settings()

    return useMutation({
        mutationFn: (patch: MatchDiarySettingsPatch) =>
            updateMatchDiarySettingsApi(patch),

        onMutate: async (patch) => {
            await qc.cancelQueries({ queryKey: key })
            const previous = qc.getQueryData<MatchDiarySettings>(key)

            qc.setQueryData<MatchDiarySettings>(key, (old) =>
                old ? { ...old, ...patch } : old
            )

            return { previous }
        },

        onError: (err, _patch, ctx) => {
            // Put the switch back exactly where it was, and say so. A switch
            // that silently stayed moved would tell a player their diary is
            // showcased when nobody can see it.
            if (ctx?.previous) qc.setQueryData(key, ctx.previous)
            toast.error(getMatchDiaryErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
        },
    })
}
