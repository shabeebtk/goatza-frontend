"use client"

/**
 * One match card, plus the skeleton that stands in for it while loading.
 *
 * The skeleton is in this file on purpose: it has to match the real card's
 * geometry, and the surest way to keep two things the same shape is to make
 * them impossible to edit apart.
 *
 * The card REPLACED a one-line row, and the reason is what the row threw away.
 * The API already returns every stat, the self rating, the note and the photo;
 * the row printed one headline stat and dropped the rest, so a diary a player
 * had filled in carefully read exactly like one they had not. The card shows
 * the work. It is still a summary — tapping it opens the detail modal, which is
 * where a match is READ, and editing is a step past that rather than the
 * default.
 *
 * WHAT THE CARD DELIBERATELY DOES NOT DO:
 *
 *   - It never renders a stat the player did not log. An absent stat is not a
 *     zero, and the season summary counts the two differently, so a fabricated
 *     "0 Assists" would be a number nobody entered.
 *   - It never renders an empty rating, an empty note strip or an "unrated"
 *     label. A card for a match with an opponent and nothing else is three
 *     lines tall, and that is correct.
 *   - It caps its stat tiles. Twelve tiles at 64px would wrap into a block of
 *     numbers nobody scans; the modal is where all of them live.
 */

import dayjs from "dayjs"
import { Icon } from "@iconify/react"

import {
    MATCH_RESULT_LABELS,
    MATCH_TYPE_LABELS,
    formatStatValue,
    opponentLabel,
    resultTone,
} from "../../matchDiaryMeta"
import { SELF_RATING_MAX, type MatchEntry, type MatchEntryStat } from "../../types"
import styles from "./MatchDiaryPage.module.css"

/** How many stat tiles a card shows before the rest collapse into "+N". */
export const MAX_CARD_STATS = 4

/**
 * The stats a card shows, primaries first.
 *
 * A partition rather than a sort, because the API's order is already meaningful
 * and stable — the list endpoint orders each entry's stats by the catalog's own
 * `order` then name — so this only lifts the ones an admin marked primary above
 * it. Re-sorting from scratch would throw away the ordering the catalog exists
 * to express, and a card whose tiles reshuffled between two matches of the same
 * sport would be unreadable at a glance.
 */
export const cardStats = (stats: MatchEntryStat[]): MatchEntryStat[] =>
    [
        ...stats.filter((stat) => stat.is_primary),
        ...stats.filter((stat) => !stat.is_primary),
    ].slice(0, MAX_CARD_STATS)

/**
 * Five stars, filled to the rating.
 *
 * Rendered only when there IS a rating — `self_rating` is nullable and an empty
 * row of outlines would read as "rated zero", which is not a thing the form can
 * even produce. The stars are decoration; the label beside them is what a
 * screen reader gets.
 */
function CardRating({ value }: { value: number }) {
    return (
        <span
            className={styles.cardRating}
            role="img"
            aria-label={`Your rating: ${value} out of ${SELF_RATING_MAX}`}
        >
            {Array.from({ length: SELF_RATING_MAX }, (_, index) => (
                <Icon
                    key={index}
                    icon={index < value ? "mdi:star" : "mdi:star-outline"}
                    width={13}
                    height={13}
                    aria-hidden="true"
                />
            ))}
        </span>
    )
}

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

    // A fixture is neutral whatever its result column happens to say — the
    // server keeps that at "na" and the card should not imply otherwise.
    const tone = isFixture ? "neutral" : resultTone(entry.result)

    const stats = cardStats(entry.stats)
    const hiddenStats = entry.stats.length - stats.length
    const hasTiles = stats.length > 0 || entry.minutes_played !== null

    // `photo_url` is a BLANK STRING when there is no photo, never null — so
    // this is a truthiness check and not a null check.
    const note = entry.notes.trim()
    const hasStrip = Boolean(note) || Boolean(entry.photo_url)

    return (
        <li className={styles.card}>
            <button
                type="button"
                className={styles.cardBtn}
                data-scheduled={isFixture ? "true" : undefined}
                onClick={() => onOpen(entry)}
            >
                {/* ── Header ──
                    Tinted by the result, so a season scrolls as a colour band
                    before any of it is read. */}
                <span className={styles.cardHead} data-tone={tone}>
                    {isFixture ? (
                        <span className={`${styles.chip} ${styles.chipScheduled}`}>
                            Scheduled
                        </span>
                    ) : (
                        // Empty for "na", and an `na` match gets NO chip —
                        // "Not applicable" is a database value, not something
                        // to print on a card.
                        resultLabel && (
                            <span
                                className={`${styles.chip} ${styles.chipResult}`}
                                data-tone={tone}
                            >
                                {resultLabel}
                            </span>
                        )
                    )}

                    <span className={styles.cardOpponent}>
                        {opponentLabel(entry.opponent_name)}
                    </span>

                    <span className={styles.cardDate} aria-hidden="true">
                        {date.format("D MMM")}
                    </span>
                </span>

                <span className={styles.cardBody}>
                    {/* ── Tiles ──
                        One per stat the player actually logged, plus minutes.
                        A match with one stat gets two tiles, not five empty
                        ones — the grid's auto-fit is what makes a short row
                        fill the width instead of leaving holes. */}
                    {hasTiles && (
                        <span className={styles.tiles}>
                            {stats.map((stat) => (
                                <span
                                    key={stat.stat_field_id}
                                    className={styles.tile}
                                >
                                    <span className={styles.tileValue}>
                                        {formatStatValue(
                                            stat.value,
                                            stat.value_type
                                        )}
                                        {stat.unit && (
                                            <span className={styles.tileUnit}>
                                                {stat.unit}
                                            </span>
                                        )}
                                    </span>
                                    {/* The full name, not `short_label`, which
                                        is too cryptic at this size. Truncated
                                        rather than wrapped so every tile in a
                                        row is the same height. */}
                                    <span
                                        className={styles.tileLabel}
                                        title={stat.name}
                                    >
                                        {stat.name}
                                    </span>
                                </span>
                            ))}

                            {hiddenStats > 0 && (
                                <span
                                    className={`${styles.tile} ${styles.tileMore}`}
                                >
                                    <span className={styles.tileValue}>
                                        +{hiddenStats}
                                    </span>
                                    <span className={styles.tileLabel}>
                                        more
                                    </span>
                                </span>
                            )}

                            {entry.minutes_played !== null && (
                                <span className={styles.tile}>
                                    <span className={styles.tileValue}>
                                        {entry.minutes_played}
                                        <span className={styles.tileUnit}>
                                            &prime;
                                        </span>
                                    </span>
                                    <span className={styles.tileLabel}>
                                        Played
                                    </span>
                                </span>
                            )}
                        </span>
                    )}

                    <span className={styles.cardMeta}>
                        <span className={styles.cardMetaText}>
                            <span className={styles.cardMetaItem}>
                                {MATCH_TYPE_LABELS[entry.match_type]}
                            </span>

                            {entry.position && (
                                <span className={styles.cardMetaItem}>
                                    {entry.position.name}
                                </span>
                            )}
                        </span>

                        {entry.self_rating !== null && (
                            <CardRating value={entry.self_rating} />
                        )}
                    </span>

                    {/* Only when the player attached one — a card should not
                        carry an empty "during your spell at" line. */}
                    {entry.career_entry && (
                        <span className={styles.cardCareer}>
                            {entry.career_entry.organization_name}
                            {/* Only `verified` earns the tick. The other three
                                states — self_reported, pending, rejected — are
                                a claim, and a tick on a claim is a lie. */}
                            {entry.career_entry.verification_status ===
                                "verified" && (
                                    <span
                                        className={styles.cardVerified}
                                        role="img"
                                        aria-label="Verified"
                                    >
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

                    {hasStrip && (
                        <span className={styles.cardStrip}>
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

                            {note && (
                                <span className={styles.cardNote}>{note}</span>
                            )}
                        </span>
                    )}
                </span>

                {/* The card's layout is visual — tinted band, tiles, stars. This
                    is the same match as one sentence, so a screen reader gets
                    the result, the opponent and the full date without having to
                    reassemble them from the parts. */}
                <span className="sr-only">
                    {`${resultLabel || (isFixture ? "Scheduled" : "Logged")} — ${opponentLabel(
                        entry.opponent_name
                    )}, ${date.format("D MMMM YYYY")}`}
                </span>
            </button>
        </li>
    )
}

/**
 * Same geometry as the real card — tinted header band, a row of tiles, a meta
 * line — so the list does not jump when the data lands.
 */
export function MatchEntryCardSkeleton() {
    return (
        <li className={`${styles.card} ${styles.cardSkeleton}`} aria-hidden="true">
            <span className={styles.skeletonHead} />
            <span className={styles.skeletonBody}>
                <span className={styles.skeletonTiles}>
                    {[0, 1, 2, 3].map((index) => (
                        <span key={index} className={styles.skeletonTile} />
                    ))}
                </span>
                <span className={styles.skeletonLine} />
            </span>
        </li>
    )
}
