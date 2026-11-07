"use client"

/**
 * One match card, plus the skeleton that stands in for it while loading.
 *
 * The skeleton is in this file on purpose: it has to match the real card's
 * geometry, and the surest way to keep two things the same shape is to make
 * them impossible to edit apart.
 *
 * Compact on purpose, so a season scans. A W/D/L badge, who it was against, when
 * and what kind, then the first few stats on one line. The detail modal is where
 * a match is READ, and editing is a step past that.
 *
 * WHAT THE CARD DELIBERATELY DOES NOT DO:
 *
 *   - It never prints a stat the player did not log. An absent stat is not a
 *     zero, and the season summary counts the two differently, so a fabricated
 *     "0 Assists" would be a number nobody entered.
 *   - It never renders an empty stat line, note or career line. A card for a
 *     match with an opponent and nothing else is two lines, and that is correct.
 */

import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import {
    MATCH_RESULT_LABELS,
    MATCH_TYPE_LABELS,
    opponentHeading,
    opponentLabel,
    statPhrase,
} from "../../matchDiaryMeta"
import type { MatchEntry, MatchEntryStat } from "../../types"
import MatchResultBadge from "../MatchResultBadge/MatchResultBadge"
import styles from "./MatchDiaryPage.module.css"

/** How many stats the line shows before the rest collapse into "+N". */
export const MAX_CARD_STATS = 3

/**
 * The stats a card shows, primaries first.
 *
 * A partition rather than a sort, because the API's order is already meaningful
 * and stable — the list endpoint orders each entry's stats by the catalog's own
 * `order` then name — so this only lifts the ones an admin marked primary above
 * it. Re-sorting from scratch would throw away the ordering the catalog exists
 * to express, and a card whose stats reshuffled between two matches of the same
 * sport would be unreadable at a glance.
 */
export const cardStats = (stats: MatchEntryStat[]): MatchEntryStat[] =>
    [
        ...stats.filter((stat) => stat.is_primary),
        ...stats.filter((stat) => !stat.is_primary),
    ].slice(0, MAX_CARD_STATS)

export function MatchEntryCard({
    entry,
    onOpen,
}: {
    entry: MatchEntry
    onOpen: (entry: MatchEntry) => void
}) {
    const date = dayjs(entry.date)
    const isFixture = entry.status === "scheduled"
    const resultLabel = MATCH_RESULT_LABELS[entry.result]

    const stats = cardStats(entry.stats)
    const hiddenStats = entry.stats.length - stats.length

    const meta = [
        date.format("D MMM"),
        MATCH_TYPE_LABELS[entry.match_type],
        entry.minutes_played !== null ? `${entry.minutes_played}′` : null,
    ]
        .filter(Boolean)
        .join(" · ")

    // Everything visible here is a fragment. This is the same match as one
    // sentence, so a screen reader gets the result, the opponent and the full
    // date without having to reassemble them from the parts.
    const label = `${resultLabel || (isFixture ? "Scheduled" : "Logged")} — ${opponentLabel(
        entry.opponent_name
    )}, ${date.format("D MMMM YYYY")}`

    // `photo_url` is a BLANK STRING when there is no photo, never null — so
    // this is a truthiness check and not a null check.
    const note = entry.notes.trim()

    return (
        <li className={styles.card}>
            <button
                type="button"
                className={styles.cardBtn}
                data-scheduled={isFixture ? "true" : undefined}
                aria-label={label}
                onClick={() => onOpen(entry)}
            >
                <MatchResultBadge result={entry.result} />

                <span className={styles.cardMain}>
                    <span className={styles.cardTitleRow}>
                        <span className={styles.cardOpponent}>
                            {opponentHeading(entry.opponent_name)}
                        </span>
                        {isFixture && (
                            <span className={styles.chipScheduled}>Scheduled</span>
                        )}
                    </span>

                    <span className={styles.cardMeta}>{meta}</span>

                    {stats.length > 0 && (
                        <span className={styles.cardStats}>
                            <span className={styles.cardStatsText}>
                                {stats.map(statPhrase).join(" · ")}
                            </span>
                            {hiddenStats > 0 && (
                                <span className={styles.cardStatsMore}>
                                    +{hiddenStats}
                                </span>
                            )}
                        </span>
                    )}

                    {/* Only when the player attached one. */}
                    {entry.career_entry && (
                        <span className={styles.cardCareer}>
                            <span className={styles.cardCareerName}>
                                {entry.career_entry.organization_name}
                            </span>
                            {/* Only `verified` earns the tick. The other three
                                states — self_reported, pending, rejected — are
                                a claim, and a tick on a claim is a lie. */}
                            {entry.career_entry.verification_status ===
                                "verified" && (
                                    <span className={styles.cardVerified}>
                                        <Icon
                                            icon="mdi:check-decagram"
                                            width={13}
                                            height={13}
                                            aria-hidden="true"
                                        />
                                    </span>
                                )}
                        </span>
                    )}

                    {note && <span className={styles.cardNote}>{note}</span>}
                </span>

                {entry.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={entry.photo_url}
                        alt=""
                        className={styles.cardThumb}
                        loading="lazy"
                        decoding="async"
                    />
                )}
            </button>
        </li>
    )
}

/** Same geometry as the real card, so the list does not jump when data lands. */
export function MatchEntryCardSkeleton() {
    return (
        <li className={styles.cardSkeleton} aria-hidden="true">
            <span className={styles.skeletonBadge} />
            <span className={styles.skeletonLines}>
                <span className={styles.skeletonLine} data-width="title" />
                <span className={styles.skeletonLine} data-width="meta" />
                <span className={styles.skeletonLine} data-width="stats" />
            </span>
        </li>
    )
}
