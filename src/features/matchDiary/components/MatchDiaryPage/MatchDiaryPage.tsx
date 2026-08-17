"use client"

/**
 * MatchDiaryPage — the player's own diary, at /matches.
 *
 * Self-scoped like the API: it always shows the SIGNED-IN player's matches, so
 * there is no username in the URL and no visibility check that could be
 * forgotten. A coach, a scout or an organization actor gets the server's own
 * 403 message rather than an empty list, because "you have no matches" and
 * "this feature is not for your account" are very different things to read.
 *
 * The order of the page is the order of intent, not the order of the data:
 *
 *   1. OVERDUE fixtures. The single highest-value element here — a match the
 *      player scheduled, played, and never logged. In v1 it is the only thing
 *      that pulls somebody back into the diary, so it sits above everything
 *      including their own history.
 *   2. Upcoming fixtures, which are a reminder rather than a task.
 *   3. Filters.
 *   4. The diary itself, grouped by month.
 *
 * Filters drive SERVER params. The list is paginated, so filtering the loaded
 * pages would hide matches that had simply not been fetched yet.
 *
 * ── Reading a match, then editing it ──────────────────────────
 *
 * Tapping a card OPENS THE DETAIL MODAL, not the edit form. Editing used to be
 * the only thing a tap could do, which meant there was no way to read a match
 * at all — the note, the rating and eleven of the twelve stats existed only as
 * form fields. Two pieces of state, not one:
 *
 *   detailId → which match is being read
 *   sheet    → what the edit form is doing, exactly as before
 *
 * They overlap on purpose. "Edit match" leaves `detailId` set and opens the
 * sheet over it, so closing the sheet lands back on the match that was being
 * read rather than on the list — with the edit already showing, because the
 * modal's entry is looked up in the list by id on every render instead of being
 * captured when the card was tapped.
 *
 * The one place a tap still goes straight to the form is "Log result" on an
 * overdue fixture. That is an action somebody has come back to perform, and
 * making them read the fixture first would put a step in front of the single
 * flow this page exists to complete.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import BackHeader from "@/shared/components/ui/BackHeader/BackHeader"
import { useMyUserSports } from "@/features/profile/hooks/useSportsQueries"
import {
    getMatchDiaryErrorMessage,
    isMatchDiaryForbidden,
} from "../../services/matches.api"
import { useMatches, useUpcomingMatches } from "../../hooks/useMatchDiary"
import { MATCH_TYPE_LABELS, opponentLabel } from "../../matchDiaryMeta"
import type { MatchEntry, MatchListFilters, UpcomingMatch } from "../../types"
import MatchDetailModal from "../MatchDetailModal/MatchDetailModal"
import MatchEntrySheet from "../MatchEntrySheet/MatchEntrySheet"
import MatchDiaryFilters, {
    filterSummary,
    hasActiveFilters,
    type SportOption,
} from "./MatchDiaryFilters"
import { MatchEntryCard, MatchEntryCardSkeleton } from "./MatchEntryCard"
import styles from "./MatchDiaryPage.module.css"

/**
 * What the sheet is currently doing, or null when it is closed.
 *
 * Both keys absent means "log a new match". `fixture` is its own case rather
 * than a null `entry`, for the reason `openFixture` explains.
 */
type SheetState = { entry?: MatchEntry; fixture?: UpcomingMatch } | null

export default function MatchDiaryPage() {
    const [filters, setFilters] = useState<MatchListFilters>({})
    /** The match being READ, by id. See the note at the top of the file. */
    const [detailId, setDetailId] = useState<string | null>(null)
    const [sheet, setSheet] = useState<SheetState>(null)

    const {
        data,
        isLoading,
        isError,
        error,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useMatches(filters)

    const upcoming = useUpcomingMatches()
    const { data: userSports } = useMyUserSports()

    const entries = useMemo(
        () => data?.pages.flatMap((page) => page.results) ?? [],
        [data?.pages]
    )

    const sports: SportOption[] = useMemo(
        () =>
            (userSports ?? []).map((userSport) => ({
                id: userSport.sport.id,
                name: userSport.sport.name,
            })),
        [userSports]
    )

    const fixtures = upcoming.data?.results ?? []
    const overdue = useMemo(
        () => fixtures.filter((fixture) => fixture.is_overdue),
        [fixtures]
    )
    const ahead = useMemo(
        () => fixtures.filter((fixture) => !fixture.is_overdue),
        [fixtures]
    )

    /**
     * The match the modal is reading, looked up fresh on every render.
     *
     * Deliberately derived rather than stored. An edit that saves and closes
     * invalidates the list; this then re-renders from the refetched entry, so
     * the modal underneath shows the new numbers. Holding the object the card
     * was tapped with would show the OLD ones until the modal was closed and
     * reopened — which is exactly when somebody checks whether their edit took.
     */
    const detailEntry = useMemo(
        () => entries.find((entry) => entry.id === detailId) ?? null,
        [entries, detailId]
    )

    /**
     * The match being read has left the list — an edit changed its status or
     * its date while a filter is on, or it was deleted from somewhere else.
     * Close, rather than sit on a modal with nothing behind it.
     *
     * Skipped while the sheet is open (the list is mid-invalidation and the
     * modal is not on screen anyway) and while the first page is loading (a
     * filter change empties `entries` before the new page lands).
     *
     * The rendering guard above already means nothing is drawn for a missing
     * entry, so this is not about a blank modal — it is about the id not
     * lingering. A stale one would pop the modal back open the moment the
     * match returned to the list, which for a cleared filter is a dialog
     * appearing out of a tap on something else.
     */
    useEffect(() => {
        if (!detailId || sheet || isLoading) return
        if (entries.some((entry) => entry.id === detailId)) return

        /* The lint rule guards against an effect that cascades. This one
           cannot: the render it schedules has `detailId === null`, which
           returns on the first line above. */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetailId(null)
    }, [detailId, entries, isLoading, sheet])

    const openSheet = useCallback((entry?: MatchEntry) => {
        setSheet({ entry })
    }, [])

    const openDetail = useCallback((entry: MatchEntry) => {
        setDetailId(entry.id)
    }, [])

    /**
     * The fixture strips work from an `UpcomingMatch`, which is lighter than a
     * full entry. The diary list is checked first — a fixture is in the list
     * too, and the full entry carries the notes, career stint and photo the
     * lighter shape drops — and the fixture itself is handed over when it is
     * not there, which is the normal case whenever a filter is on.
     *
     * What must NOT happen is falling back to a blank sheet: that would log a
     * SECOND match for a fixture the player already scheduled, and leave the
     * original sitting in "Up next" still asking to be logged.
     *
     * `read` is the difference between the two entry points. Tapping a fixture
     * in "Up next" is a read, so it opens the modal — but only when the full
     * entry is loaded, because the modal renders a `MatchEntry` and the lighter
     * shape genuinely does not know whether there is a note or a photo. When it
     * is not loaded the sheet takes over, which is where that tap always went.
     * "Log result" on an overdue fixture is an action and always goes there.
     */
    const openFixture = useCallback(
        (fixture: UpcomingMatch, read: boolean) => {
            const loaded = entries.find((entry) => entry.id === fixture.id)

            if (loaded && read) {
                setDetailId(loaded.id)
                return
            }

            setSheet(loaded ? { entry: loaded } : { fixture })
        },
        [entries]
    )

    // ── Infinite scroll ────────────────────────────────────────

    const sentinelRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const node = sentinelRef.current
        if (!node || !hasNextPage) return

        const observer = new IntersectionObserver(
            (observed) => {
                if (observed[0]?.isIntersecting && !isFetchingNextPage) {
                    void fetchNextPage()
                }
            },
            { rootMargin: "320px" }
        )

        observer.observe(node)
        return () => observer.disconnect()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    // ── Month grouping ─────────────────────────────────────────

    /**
     * Grouped in render order, never sorted here. The server already returns
     * newest-first; re-sorting client-side would only ever disagree with the
     * page boundaries.
     */
    const months = useMemo(() => {
        const groups: { key: string; label: string; entries: MatchEntry[] }[] = []

        for (const entry of entries) {
            const date = dayjs(entry.date)
            const key = date.format("YYYY-MM")
            const last = groups[groups.length - 1]

            if (last?.key === key) {
                last.entries.push(entry)
            } else {
                groups.push({
                    key,
                    // The year only when it is not this one — "August" reads
                    // better than "August 2026" on a page you opened today.
                    label:
                        date.year() === dayjs().year()
                            ? date.format("MMMM")
                            : date.format("MMMM YYYY"),
                    entries: [entry],
                })
            }
        }

        return groups
    }, [entries])

    // ── Forbidden ──────────────────────────────────────────────

    // The server's own words. It already says whether the problem is the role
    // or the actor, and it says it better than a generic guard could.
    if (isError && isMatchDiaryForbidden(error)) {
        return (
            <main className={styles.page}>
                <BackHeader title="Match diary" />
                <div className={styles.state}>
                    <Icon icon="mdi:lock-outline" width={34} height={34} />
                    <p className={styles.stateTitle}>
                        {getMatchDiaryErrorMessage(error)}
                    </p>
                </div>
            </main>
        )
    }

    const filtered = hasActiveFilters(filters)
    const isEmpty = !isLoading && !isError && entries.length === 0

    return (
        <main className={styles.page}>
            <div className={styles.headerRow}>
                <BackHeader title="Match diary" />

                {/* One add button at every width — icon-only below 640px. There
                    is no FAB: it landed directly above the bottom nav's own
                    "+", which opens the post composer, and two plus buttons in
                    one corner doing different things is a coin toss. */}
                <button
                    type="button"
                    className={styles.headerAddBtn}
                    onClick={() => openSheet()}
                    aria-label="Log a match"
                >
                    <Icon icon="mdi:plus" width={18} height={18} />
                    <span className={styles.headerAddLabel}>Log a match</span>
                </button>
            </div>

            <div className={styles.content}>
                {/* ── Overdue ── */}
                {overdue.length > 0 && (
                    <section
                        className={styles.overdue}
                        aria-label="Matches waiting to be logged"
                    >
                        {overdue.map((fixture) => (
                            <div key={fixture.id} className={styles.overdueRow}>
                                <span
                                    className={styles.overdueIcon}
                                    aria-hidden="true"
                                >
                                    <Icon
                                        icon="mdi:calendar-alert-outline"
                                        width={18}
                                        height={18}
                                    />
                                </span>
                                <p className={styles.overdueText}>
                                    You played{" "}
                                    <strong>
                                        {opponentLabel(fixture.opponent_name)}
                                    </strong>{" "}
                                    on {dayjs(fixture.date).format("D MMM")}
                                </p>
                                <button
                                    type="button"
                                    className={styles.overdueBtn}
                                    onClick={() => openFixture(fixture, false)}
                                >
                                    Log result
                                </button>
                            </div>
                        ))}
                    </section>
                )}

                {/* ── Upcoming ──
                    Tappable, same as a diary card: a fixture you can see but
                    cannot open is a dead end when the kick-off moves, and it
                    is also how a player logs a result the same evening rather
                    than waiting for the row to go overdue. */}
                {ahead.length > 0 && (
                    <section className={styles.upcoming}>
                        <h2 className={styles.sectionTitle}>Up next</h2>
                        <ul className={styles.upcomingList}>
                            {ahead.map((fixture) => (
                                <li key={fixture.id}>
                                    <button
                                        type="button"
                                        className={styles.upcomingRow}
                                        onClick={() =>
                                            openFixture(fixture, true)
                                        }
                                    >
                                        <span className={styles.upcomingDate}>
                                            {dayjs(fixture.date).format(
                                                "ddd D MMM"
                                            )}
                                            {fixture.kickoff_time && (
                                                <span
                                                    className={
                                                        styles.upcomingTime
                                                    }
                                                >
                                                    {fixture.kickoff_time.slice(
                                                        0,
                                                        5
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className={styles.upcomingOpponent}
                                        >
                                            {opponentLabel(
                                                fixture.opponent_name
                                            )}
                                        </span>
                                        <span className={styles.upcomingType}>
                                            {
                                                MATCH_TYPE_LABELS[
                                                fixture.match_type
                                                ]
                                            }
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* ── Filters ── */}
                <MatchDiaryFilters
                    filters={filters}
                    sports={sports}
                    onChange={setFilters}
                />

                {/* ── Loading ── */}
                {isLoading && (
                    <ul className={styles.list}>
                        {[0, 1, 2, 3, 4].map((index) => (
                            <MatchEntryCardSkeleton key={index} />
                        ))}
                    </ul>
                )}

                {/* ── Error ── */}
                {isError && !isLoading && (
                    <div className={styles.state}>
                        <Icon icon="mdi:cloud-off-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>
                            {getMatchDiaryErrorMessage(error)}
                        </p>
                        <button
                            type="button"
                            className={styles.stateBtn}
                            onClick={() => void refetch()}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* ── Empty ── */}
                {isEmpty && !filtered && (
                    <div className={styles.state}>
                        <Icon icon="mdi:notebook-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>Log your first match.</p>
                        <span className={styles.stateHint}>
                            Opponent, result, a couple of stats — takes about
                            thirty seconds.
                        </span>
                        <button
                            type="button"
                            className={styles.stateBtn}
                            onClick={() => openSheet()}
                        >
                            <Icon icon="mdi:plus" width={16} height={16} />
                            Log a match
                        </button>
                    </div>
                )}

                {isEmpty && filtered && (
                    <div className={styles.state}>
                        <Icon icon="mdi:filter-off-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>
                            {filterSummary(filters, sports)}
                        </p>
                        <button
                            type="button"
                            className={styles.stateBtn}
                            onClick={() => setFilters({})}
                        >
                            Clear filters
                        </button>
                    </div>
                )}

                {/* ── The diary ── */}
                {months.map((month) => (
                    <section key={month.key} className={styles.month}>
                        <h2 className={styles.monthHeader}>{month.label}</h2>
                        <ul className={styles.list}>
                            {month.entries.map((entry) => (
                                <MatchEntryCard
                                    key={entry.id}
                                    entry={entry}
                                    onOpen={openDetail}
                                />
                            ))}
                        </ul>
                    </section>
                ))}

                {isFetchingNextPage && (
                    <ul className={styles.list}>
                        {[0, 1].map((index) => (
                            <MatchEntryCardSkeleton key={index} />
                        ))}
                    </ul>
                )}

                {hasNextPage && <div ref={sentinelRef} aria-hidden="true" />}
            </div>

            {/* Hidden while the sheet is open, and `detailId` is kept — so
                saving an edit and closing the sheet lands back on this modal,
                rendering the entry as the refreshed list now holds it. */}
            {detailEntry && !sheet && (
                <MatchDetailModal
                    entry={detailEntry}
                    onEdit={() => setSheet({ entry: detailEntry })}
                    onClose={() => setDetailId(null)}
                />
            )}

            {sheet && (
                <MatchEntrySheet
                    entry={sheet.entry}
                    fixture={sheet.fixture}
                    onClose={() => setSheet(null)}
                />
            )}
        </main>
    )
}
