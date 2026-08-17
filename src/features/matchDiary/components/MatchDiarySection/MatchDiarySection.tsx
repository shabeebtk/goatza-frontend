"use client"

/**
 * MatchDiarySection — the match diary on a player's profile.
 *
 * In v1 this is the diary's ONLY entry point: there is no nav item, so a player
 * who never scrolls their own profile never finds the feature. That is why the
 * owner's empty state is an invitation rather than a blank card.
 *
 * ── Who sees what, and why ────────────────────────────────────
 *
 * OWNER   → the summary, their next fixture, their three most recent matches,
 *           and the two ways in: "Log a match" and "View all".
 * VISITOR → the summary and nothing else. Not the entries, not the notes, not
 *           the photos, not the ratings. The diary is private; the SUMMARY is
 *           the part a player chose to publish, and that choice is a single
 *           toggle in settings. Rendering one match here would quietly widen
 *           what that toggle means.
 * NOBODY  → when a visitor's request 404s, this renders NOTHING. Not an empty
 *           card, not "this player has no diary". Same reasoning CareerSection
 *           gives for an empty history: a heading with nothing under it on
 *           someone else's profile is worse than no heading, and here it is
 *           also an information leak — a distinct "showcase is off" state is a
 *           way to enumerate who has a diary, which is exactly what the
 *           backend's uniform 404 exists to prevent.
 *
 * ── The public (logged-out) profile ───────────────────────────
 *
 * Renders nothing at all. `/matches/summary/<username>` is authenticated on
 * purpose — the Sports CV is the surface that faces logged-out visitors, with
 * its own opt-in and its own safeguarding rules. Firing it from the public
 * profile would 401 under a section that then has nothing to show.
 */

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"

import {
    useMatches,
    usePlayerMatchSummary,
    useUpcomingMatches,
} from "../../hooks/useMatchDiary"
import {
    MATCH_RESULT_LABELS,
    headlineStat,
    opponentLabel,
    resultTone,
} from "../../matchDiaryMeta"
import { UPCOMING_LIMIT, type MatchEntry, type UpcomingMatch } from "../../types"
import MatchEntrySheet from "../MatchEntrySheet/MatchEntrySheet"
import SeasonSummaryCard, {
    SeasonSummaryCardSkeleton,
} from "../SeasonSummaryCard/SeasonSummaryCard"
import styles from "./MatchDiarySection.module.css"

/** How many matches the profile shows before "View all". */
const RECENT_LIMIT = 3

/** What the sheet is doing, or null when closed. Mirrors MatchDiaryPage. */
type SheetState = { entry?: MatchEntry; fixture?: UpcomingMatch } | null

// ── Recent row ────────────────────────────────────────────────

/**
 * Deliberately thinner than MatchDiaryPage's row and not shared with it.
 *
 * That row is a control — it opens the edit sheet, carries a photo thumbnail
 * and a screen-reader summary, and is sized for a scannable list of twenty.
 * This is a glance at three, inside a card, on a page about something else.
 * Sharing one component would mean the profile inheriting every change made
 * for the diary page, which is the wrong dependency direction.
 */
function RecentRow({
    entry,
    onOpen,
}: {
    entry: MatchEntry
    onOpen: (entry: MatchEntry) => void
}) {
    const resultLabel = MATCH_RESULT_LABELS[entry.result]
    const headline = headlineStat(entry)

    return (
        <li>
            <button
                type="button"
                className={styles.recentRow}
                onClick={() => onOpen(entry)}
            >
                <span className={styles.recentDate}>
                    {dayjs(entry.date).format("D MMM")}
                </span>

                <span className={styles.recentOpponent}>
                    {opponentLabel(entry.opponent_name)}
                </span>

                {headline && (
                    <span className={styles.recentStat}>{headline}</span>
                )}

                {resultLabel && (
                    <span
                        className={styles.recentResult}
                        data-tone={resultTone(entry.result)}
                    >
                        {resultLabel}
                    </span>
                )}
            </button>
        </li>
    )
}

// ── Section ───────────────────────────────────────────────────

export type MatchDiarySectionProps = {
    /** The profile owner's username — the showcase endpoint keys on it. */
    username: string
    /** The logged-in person is this profile. */
    isOwn: boolean
}

export default function MatchDiarySection({
    username,
    isOwn,
}: MatchDiarySectionProps) {
    const publicProfile = usePublicProfile()
    const role = useAuthStore((s) => s.user?.role)
    const actorType = useAuthStore((s) => s.actorType)
    const { toMatchDiary } = useNavigation()

    const [year, setYear] = useState<number | null>(null)
    const [sheet, setSheet] = useState<SheetState>(null)

    /**
     * The owner's own view, in the sense the API means it: a player, acting as
     * themselves. Acting as one of their organizations is not owning your own
     * diary — the endpoints refuse it — so an org actor on their own profile
     * gets the visitor's read-only card, which is what the server would give
     * them anyway.
     */
    const canManage =
        isOwn && role === "player" && actorType === "user" && !publicProfile

    const summaryQuery = usePlayerMatchSummary(
        username,
        year ? { year } : {},
        // Never fired for a logged-out visitor: the endpoint is authenticated,
        // and there is no diary slice in the public profile bundle.
        { enabled: !publicProfile }
    )

    /**
     * Owner-only reads, and the `enabled` matters.
     *
     * Both routes are SELF-scoped — there is no username in either — so leaving
     * them on for a visitor would not read the profile owner's diary, it would
     * read the VIEWER'S OWN while they look at someone else's page. Two
     * requests per profile view, for data nothing on the page can render.
     *
     * `useMatches({})` is the same key the diary page uses unfiltered, so the
     * three rows here also warm /matches for the tap that usually follows.
     */
    const upcomingQuery = useUpcomingMatches(UPCOMING_LIMIT, {
        enabled: canManage,
    })
    const recentQuery = useMatches({}, { enabled: canManage })

    const summary = summaryQuery.data

    /**
     * The next fixture, not the next overdue one.
     *
     * `upcoming` is ordered soonest-first and deliberately still contains
     * fixtures whose date has passed. Those belong on the diary page, where
     * there is a "Log result" button beside them — on a profile they would be
     * a reproach with nothing to do about it.
     */
    const nextFixture = canManage
        ? upcomingQuery.data?.results.find((fixture) => !fixture.is_overdue)
        : undefined

    const entries = canManage
        ? (recentQuery.data?.pages[0]?.results ?? [])
        : []
    const recent = entries.slice(0, RECENT_LIMIT)

    /**
     * Years the player can be PROVEN to have matches in.
     *
     * Read off the entries already loaded rather than asked for: there is no
     * endpoint that lists a player's years, and adding one for a select box
     * would be the wrong trade. The consequence is stated plainly — a player
     * with more than a page of matches in the current year may not be offered
     * an older one until they open the diary itself. A visitor gets no picker
     * at all, because the only honest source would be their entries, and a
     * visitor is never shown those.
     */
    const years = canManage
        ? Array.from(
            new Set(entries.map((entry) => Number(entry.date.slice(0, 4))))
        ).sort((a, b) => b - a)
        : []

    // ── Nothing to show ───────────────────────────────────────

    // Logged-out: the diary has no public surface. Say nothing, fetch nothing.
    if (publicProfile) return null

    // A visitor whose request has not settled, failed, or 404'd. All three are
    // silence: the card appearing and then vanishing would be worse than it
    // never appearing, and a 404 is the API's uniform "there is nothing here
    // for you", which must look identical to "no such player".
    if (!canManage && (summaryQuery.isPending || !summary)) return null

    // The owner's first load. A skeleton at the card's real height, so the
    // sections below it do not jump when the summary lands.
    //
    // Waits on the FIXTURE query too, even though the card does not use it:
    // whether there is a fixture decides between the full section and the
    // one-line invitation, and resolving that after paint would swap one for
    // the other under the reader.
    if (canManage && (summaryQuery.isPending || upcomingQuery.isPending)) {
        return (
            <div className={styles.section}>
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <Icon
                            icon="mdi:notebook-outline"
                            width={16}
                            height={16}
                            aria-hidden="true"
                        />
                        Match diary
                    </h2>
                </div>
                <SeasonSummaryCardSkeleton />
            </div>
        )
    }

    /**
     * The owner, with no diary at all.
     *
     * A single line, not a card. This is the feature's only entry point, so it
     * has to say it exists — but a full empty card on the profile of somebody
     * who has not opted into the feature is the profile nagging, and the
     * sections above and below it have earned their space.
     *
     * Also covers the owner whose summary 404'd (a role change, a fresh
     * account): there is nothing to show either way, and the invitation is
     * still the right thing on their own profile.
     */
    // `year === null` guards the one false positive: a player who picks a year
    // they played nothing in should get the card back with the picker still on
    // it, not an invitation to a feature they are already using.
    if (canManage && year === null && (!summary || summary.total_matches === 0)) {
        // A scheduled-only diary is not empty — the fixture strip below has
        // something to say — so only fall through to the invitation when there
        // is genuinely nothing.
        if (!nextFixture) {
            return (
                <div className={styles.section}>
                    <button
                        type="button"
                        className={styles.invitation}
                        onClick={() => setSheet({})}
                    >
                        <Icon
                            icon="mdi:notebook-plus-outline"
                            width={18}
                            height={18}
                            aria-hidden="true"
                        />
                        <span>
                            Log a match — build a season record coaches can read.
                        </span>
                        <Icon
                            icon="mdi:chevron-right"
                            width={18}
                            height={18}
                            aria-hidden="true"
                        />
                    </button>

                    {sheet && (
                        <MatchEntrySheet
                            entry={sheet.entry}
                            fixture={sheet.fixture}
                            onClose={() => setSheet(null)}
                        />
                    )}
                </div>
            )
        }
    }

    // ── The section ───────────────────────────────────────────

    return (
        <>
            <div className={styles.section} id="match-diary">
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        <Icon
                            icon="mdi:notebook-outline"
                            width={16}
                            height={16}
                            aria-hidden="true"
                        />
                        Match diary
                    </h2>

                    {canManage && (
                        <button
                            type="button"
                            className={styles.addBtn}
                            onClick={() => setSheet({})}
                        >
                            <Icon icon="mdi:plus" width={15} height={15} />
                            Log a match
                        </button>
                    )}
                </div>

                {summary && (
                    <SeasonSummaryCard
                        summary={summary}
                        streakWeeks={summary.current_streak_weeks}
                        years={years}
                        year={year}
                        onYearChange={setYear}
                        isOwn={canManage}
                    />
                )}

                {/* ── Owner only, below the card ── */}
                {canManage && (
                    <>
                        {nextFixture && (
                            <button
                                type="button"
                                className={styles.fixture}
                                onClick={() =>
                                    setSheet({ fixture: nextFixture })
                                }
                            >
                                <span
                                    className={styles.fixtureIcon}
                                    aria-hidden="true"
                                >
                                    <Icon
                                        icon="mdi:calendar-clock-outline"
                                        width={16}
                                        height={16}
                                    />
                                </span>
                                <span className={styles.fixtureText}>
                                    <span className={styles.fixtureLabel}>
                                        Up next
                                    </span>
                                    <span className={styles.fixtureMatch}>
                                        {opponentLabel(
                                            nextFixture.opponent_name
                                        )}
                                        {" · "}
                                        {dayjs(nextFixture.date).format(
                                            "ddd D MMM"
                                        )}
                                        {nextFixture.kickoff_time && (
                                            <>
                                                {" · "}
                                                {nextFixture.kickoff_time.slice(
                                                    0,
                                                    5
                                                )}
                                            </>
                                        )}
                                    </span>
                                </span>
                                <Icon
                                    icon="mdi:chevron-right"
                                    width={18}
                                    height={18}
                                    aria-hidden="true"
                                />
                            </button>
                        )}

                        {recent.length > 0 && (
                            <ul className={styles.recentList}>
                                {recent.map((entry) => (
                                    <RecentRow
                                        key={entry.id}
                                        entry={entry}
                                        onOpen={(target) =>
                                            setSheet({ entry: target })
                                        }
                                    />
                                ))}
                            </ul>
                        )}

                        <Link href={toMatchDiary()} className={styles.viewAll}>
                            View all matches
                            <Icon
                                icon="mdi:arrow-right"
                                width={15}
                                height={15}
                                aria-hidden="true"
                            />
                        </Link>
                    </>
                )}
            </div>

            {sheet && canManage && (
                <MatchEntrySheet
                    entry={sheet.entry}
                    fixture={sheet.fixture}
                    onClose={() => setSheet(null)}
                />
            )}
        </>
    )
}
