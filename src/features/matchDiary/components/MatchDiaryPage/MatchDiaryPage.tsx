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
 * The order of the page:
 *
 *   1. The season overview for the current filters. A compact card with a "See
 *      all stats" toggle, and from 1024px the full card in a sticky right rail.
 *   2. Fixtures. Overdue ones first, a match the player scheduled, played and
 *      never logged, then Up next.
 *   3. Results, PLAYED matches only, grouped by month. Fixtures live in Up next,
 *      so the list has no status filter and never shows one twice.
 *
 * Filters drive SERVER params. The list is paginated, so filtering the loaded
 * pages would hide matches that had simply not been fetched yet.
 *
 * ── Reading a match, then editing it ──────────────────────────
 *
 * Tapping a card OPENS THE DETAIL MODAL, not the edit form. "Edit match" opens
 * the sheet over the modal and leaves it mounted underneath, so one back press
 * or a save lands on the match that was being read, with the edit already
 * showing. See useMatchDetailState.
 *
 * "Log result" on an overdue fixture goes straight to the form, in Played mode.
 * That is an action somebody has come back to perform, and making them read the
 * fixture first would put a step in front of it.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import BackHeader from "@/shared/components/ui/BackHeader/BackHeader"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { useMyUserSports } from "@/features/profile/hooks/useSportsQueries"
import {
    getMatchDiaryErrorMessage,
    isMatchDiaryForbidden,
} from "../../services/matches.api"
import {
    useMatches,
    useMatchSummary,
    useUpcomingMatches,
} from "../../hooks/useMatchDiary"
import { useMatchDetailState } from "../../hooks/useMatchDetailState"
import {
    MATCH_TYPE_LABELS,
    opponentHeading,
    opponentLabel,
} from "../../matchDiaryMeta"
import type { MatchEntry, UpcomingMatch } from "../../types"
import MatchDetailModal from "../MatchDetailModal/MatchDetailModal"
import MatchEntrySheet from "../MatchEntrySheet/MatchEntrySheet"
import SeasonSummaryCard, {
    SeasonSummaryCardSkeleton,
} from "../SeasonSummaryCard/SeasonSummaryCard"
import MatchDiaryFilters, {
    filterSummary,
    hasActiveFilters,
    type DiaryFilters,
    type SportOption,
} from "./MatchDiaryFilters"
import { MatchEntryCard, MatchEntryCardSkeleton } from "./MatchEntryCard"
import styles from "./MatchDiaryPage.module.css"

/** How many fixtures Up next shows before "Show all". */
const UP_NEXT_PREVIEW = 3

/**
 * What the sheet is currently doing, or null when it is closed.
 *
 * Both keys absent means "log a new match". `fixture` is its own case rather
 * than a null `entry`: a blank sheet would log a SECOND match for a fixture the
 * player already scheduled, and leave the original still asking to be logged.
 */
type SheetState = {
    entry?: MatchEntry
    fixture?: UpcomingMatch
    startPlayed?: boolean
} | null

export default function MatchDiaryPage() {
    const [filters, setFilters] = useState<DiaryFilters>({})
    const [sheet, setSheet] = useState<SheetState>(null)
    const [showAllUpcoming, setShowAllUpcoming] = useState(false)

    const isWide = useMediaQuery("(min-width: 1024px)")

    const results = useMatches({ ...filters, status: "played" })
    const summary = useMatchSummary(filters)
    const upcoming = useUpcomingMatches()
    const { data: userSports } = useMyUserSports()

    const fixtures = useMemo(() => upcoming.data?.results ?? [], [upcoming.data])
    const overdue = useMemo(
        () => fixtures.filter((fixture) => fixture.is_overdue),
        [fixtures]
    )
    const ahead = useMemo(
        () => fixtures.filter((fixture) => !fixture.is_overdue),
        [fixtures]
    )

    // The full rows behind Up next. `upcoming` is lighter and does not know
    // about a note or a photo, and the detail modal renders a whole entry.
    const scheduled = useMatches(
        { status: "scheduled" },
        { enabled: fixtures.length > 0 }
    )

    const entries = useMemo(
        () => results.data?.pages.flatMap((page) => page.results) ?? [],
        [results.data?.pages]
    )
    const scheduledEntries = useMemo(
        () => scheduled.data?.pages.flatMap((page) => page.results) ?? [],
        [scheduled.data?.pages]
    )
    const knownEntries = useMemo(
        () => [...entries, ...scheduledEntries],
        [entries, scheduledEntries]
    )

    const detail = useMatchDetailState(
        knownEntries,
        Boolean(sheet) || results.isFetching || scheduled.isFetching
    )

    const sports: SportOption[] = useMemo(
        () =>
            (userSports ?? []).map((userSport) => ({
                id: userSport.sport.id,
                name: userSport.sport.name,
            })),
        [userSports]
    )

    /** Tapping a fixture is a read, when the full row is here to read. */
    const readFixture = (fixture: UpcomingMatch) => {
        const loaded = scheduledEntries.find((entry) => entry.id === fixture.id)
        if (loaded) detail.open(loaded)
        else setSheet({ fixture })
    }

    /** "Log result" is an action: straight to the form, in Played mode. */
    const logFixtureResult = (fixture: UpcomingMatch) => {
        const loaded = scheduledEntries.find((entry) => entry.id === fixture.id)
        setSheet(
            loaded
                ? { entry: loaded, startPlayed: true }
                : { fixture, startPlayed: true }
        )
    }

    // ── Infinite scroll ────────────────────────────────────────

    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const {
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
    } = results

    useEffect(() => {
        const node = sentinelRef.current
        // Quiet after a failed page: a new observer reports the sentinel at once,
        // and that would retry forever. The inline row below is the retry.
        if (!node || !hasNextPage || isFetchNextPageError) return

        const observer = new IntersectionObserver(
            (observed) => {
                if (observed[0]?.isIntersecting && !isFetchingNextPage) {
                    void fetchNextPage({ cancelRefetch: false })
                }
            },
            { rootMargin: "320px" }
        )

        observer.observe(node)
        return () => observer.disconnect()
    }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError])

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
    if (results.isError && isMatchDiaryForbidden(results.error)) {
        return (
            <div className={styles.page}>
                <div className={styles.headerRow}>
                    <BackHeader title="Match diary" />
                </div>
                <div className={styles.content}>
                    <div className={styles.state}>
                        <Icon icon="mdi:lock-outline" width={34} height={34} />
                        <p className={styles.stateTitle}>
                            {getMatchDiaryErrorMessage(results.error)}
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const filtered = hasActiveFilters(filters)
    const failedOutright = results.isError && entries.length === 0
    const isEmpty = !results.isLoading && !results.isError && entries.length === 0

    const overview = summary.isPending ? (
        <SeasonSummaryCardSkeleton />
    ) : summary.data && summary.data.total_matches > 0 ? (
        <SeasonSummaryCard
            summary={summary.data}
            year={filters.year ?? null}
            isOwn
            compact={!isWide}
            stacked={isWide}
        />
    ) : null

    const hasRail = isWide && overview !== null
    const visibleAhead = showAllUpcoming ? ahead : ahead.slice(0, UP_NEXT_PREVIEW)

    return (
        <div className={`${styles.page} ${hasRail ? styles.pageWithRail : ""}`}>
            <div className={styles.headerRow}>
                <BackHeader title="Match diary" />

                {/* One add button at every width — icon-only below 768px. There
                    is no FAB: it landed directly above the bottom nav's own
                    "+", which opens the post composer, and two plus buttons in
                    one corner doing different things is a coin toss. */}
                <button
                    type="button"
                    className={styles.headerAddBtn}
                    onClick={() => setSheet({})}
                    aria-label="Log a match"
                >
                    <Icon icon="mdi:plus" width={18} height={18} />
                    <span className={styles.headerAddLabel}>Log a match</span>
                </button>
            </div>

            <div className={styles.layout}>
                <div className={styles.content}>
                    {!isWide && overview}

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
                                        onClick={() => logFixtureResult(fixture)}
                                    >
                                        Log result
                                    </button>
                                </div>
                            ))}
                        </section>
                    )}

                    {/* ── Up next ──
                        Tappable, same as a diary card: a fixture you can see but
                        cannot open is a dead end when the kick-off moves, and it
                        is also how a player logs a result the same evening rather
                        than waiting for the row to go overdue. */}
                    {ahead.length > 0 && (
                        <section>
                            <h2 className={styles.sectionTitle}>Up next</h2>
                            <ul className={styles.upcomingList}>
                                {visibleAhead.map((fixture) => (
                                    <li key={fixture.id}>
                                        <button
                                            type="button"
                                            className={styles.upcomingRow}
                                            onClick={() => readFixture(fixture)}
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
                                                {opponentHeading(
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

                            {ahead.length > UP_NEXT_PREVIEW && (
                                <button
                                    type="button"
                                    className={styles.showAllBtn}
                                    aria-expanded={showAllUpcoming}
                                    onClick={() =>
                                        setShowAllUpcoming((shown) => !shown)
                                    }
                                >
                                    {showAllUpcoming
                                        ? "Show fewer"
                                        : `Show all (${ahead.length})`}
                                </button>
                            )}
                        </section>
                    )}

                    {/* ── Results ── */}
                    <section className={styles.results}>
                        <h2 className={styles.sectionTitle}>Results</h2>

                        {/* Nothing to narrow on an empty diary: the card below
                            is the only thing that should be asking for attention. */}
                        {(!isEmpty || filtered) && !failedOutright && (
                            <MatchDiaryFilters
                                filters={filters}
                                sports={sports}
                                onChange={setFilters}
                            />
                        )}

                        {results.isLoading && (
                            <ul className={styles.list}>
                                {[0, 1, 2, 3, 4].map((index) => (
                                    <MatchEntryCardSkeleton key={index} />
                                ))}
                            </ul>
                        )}

                        {failedOutright && (
                            <div className={styles.state}>
                                <Icon
                                    icon="mdi:cloud-off-outline"
                                    width={34}
                                    height={34}
                                />
                                <p className={styles.stateTitle}>
                                    {getMatchDiaryErrorMessage(results.error)}
                                </p>
                                <button
                                    type="button"
                                    className={styles.stateBtn}
                                    onClick={() => void results.refetch()}
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {isEmpty && !filtered && (
                            <div className={`${styles.state} ${styles.stateWelcome}`}>
                                <span
                                    className={styles.stateIcon}
                                    aria-hidden="true"
                                >
                                    <Icon
                                        icon="mdi:notebook-outline"
                                        width={26}
                                        height={26}
                                    />
                                </span>
                                <p className={styles.stateTitle}>
                                    Your season, in one place
                                </p>
                                <span className={styles.stateHint}>
                                    Log each match you play: the result, your
                                    minutes and the stats that matter for your
                                    sport. It takes about thirty seconds, and the
                                    diary keeps your running totals.
                                </span>
                                <button
                                    type="button"
                                    className={styles.stateBtn}
                                    onClick={() => setSheet({})}
                                >
                                    <Icon icon="mdi:plus" width={16} height={16} />
                                    Log your first match
                                </button>
                            </div>
                        )}

                        {isEmpty && filtered && (
                            <div className={styles.state}>
                                <Icon
                                    icon="mdi:filter-off-outline"
                                    width={34}
                                    height={34}
                                />
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

                        <div
                            className={
                                results.isPlaceholderData
                                    ? styles.monthsStale
                                    : undefined
                            }
                            aria-busy={results.isPlaceholderData}
                        >
                            {months.map((month) => (
                                <section key={month.key} className={styles.month}>
                                    <h3 className={styles.monthHeader}>
                                        {month.label}
                                    </h3>
                                    <ul className={styles.list}>
                                        {month.entries.map((entry) => (
                                            <MatchEntryCard
                                                key={entry.id}
                                                entry={entry}
                                                onOpen={detail.open}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>

                        {results.isFetchingNextPage && (
                            <ul className={styles.list}>
                                {[0, 1].map((index) => (
                                    <MatchEntryCardSkeleton key={index} />
                                ))}
                            </ul>
                        )}

                        {isFetchNextPageError && (
                            <div className={styles.loadMoreError}>
                                <span>Couldn&apos;t load more matches</span>
                                <button
                                    type="button"
                                    className={styles.loadMoreRetry}
                                    onClick={() =>
                                        void fetchNextPage({ cancelRefetch: false })
                                    }
                                >
                                    Retry
                                </button>
                            </div>
                        )}

                        {hasNextPage && <div ref={sentinelRef} aria-hidden="true" />}
                    </section>
                </div>

                {hasRail && (
                    <aside className={styles.rail} aria-label="Season overview">
                        {overview}
                    </aside>
                )}
            </div>

            {/* Stays mounted under the sheet, so saving or one back press lands
                back on it, rendering the entry as the refreshed list holds it. */}
            {detail.entry && (
                <MatchDetailModal
                    entry={detail.entry}
                    covered={Boolean(sheet)}
                    onDeletingChange={detail.setDeleting}
                    onEdit={() => {
                        const current = detail.entry
                        if (!current) return
                        setSheet({
                            entry: current,
                            startPlayed: current.status === "scheduled",
                        })
                    }}
                    onClose={detail.close}
                />
            )}

            {sheet && (
                <MatchEntrySheet
                    entry={sheet.entry}
                    fixture={sheet.fixture}
                    startPlayed={sheet.startPlayed}
                    onClose={() => setSheet(null)}
                />
            )}
        </div>
    )
}
