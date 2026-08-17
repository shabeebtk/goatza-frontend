"use client"

/**
 * SeasonSummaryCard — the payoff for logging matches.
 *
 * Everything else in the diary is a form or a list and should feel like one.
 * This is the thing a player screenshots and sends to a group chat, so it is
 * the one place in the feature worth spending design on.
 *
 * ── Designed for the sparse case ──────────────────────────────
 *
 * Almost every player who sees this in month one will have three matches, not
 * a season. So: the headline never promises more than it has, the results bar
 * is legible at three segments, the stat grid is however many stats they
 * actually logged, and the streak simply is not drawn below two weeks. A card
 * that only looks right full is a card that looks broken to everyone new.
 *
 * ── Sport-agnostic, like everything else here ─────────────────
 *
 * No stat is named in this file. The grid renders whatever `summary.stats`
 * contains, in the order the API sent it — which is the catalog's own order,
 * so the sport's admin decides what leads.
 *
 * That ordering is also how the headline picks its figures. NOT by largest
 * total, which sounds right and is not: a striker's biggest football number is
 * "40 shots", and headlining that over "14 goals" would be technically
 * accurate and completely wrong. The catalog order is a human saying which
 * stats matter for this sport, and that is the question being asked.
 */

import { Fragment } from "react"
import { Icon } from "@iconify/react"

import { formatStatValue } from "../../matchDiaryMeta"
import type { MatchSummary } from "../../types"
import FormTrend from "../FormTrend/FormTrend"
import styles from "./SeasonSummaryCard.module.css"

/** Below this it is not a streak, and calling it one cheapens the word. */
const MIN_STREAK_WEEKS = 2

/** How many figures the headline carries beyond the match count. */
const HEADLINE_EXTRAS = 2

/**
 * Thousands separators without `toLocaleString`.
 *
 * Deterministic on purpose: `toLocaleString` reads the runtime's locale, which
 * is not the same on a Node render pass as it is in the browser, and a number
 * that changes between the two is a hydration mismatch on the profile page.
 */
const groupThousands = (value: number): string =>
    String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/**
 * A best-effort singular for a total of exactly one.
 *
 * Best-effort is the honest description. Stat names are authored by whoever
 * seeds a sport's catalog and the catalog stores no singular form, so this
 * handles English's two common plural endings and nothing else. It is right for
 * every label the seed ships — Goals, Assists, Wickets, Catches, Sixes, Saves,
 * Maidens — and reads slightly off for a multi-word one whose plural is not the
 * last word ("1 shots on target"). A wrong headline noun at a total of one is a
 * blemish; guessing at grammar for arbitrary user data is a bug generator.
 */
const singular = (label: string): string => {
    if (/(s|x|z|ch|sh)es$/i.test(label)) return label.slice(0, -2)
    if (/s$/i.test(label) && !/ss$/i.test(label)) return label.slice(0, -1)
    return label
}

/** "14 goals", "10.5km" — the headline form of one stat total. */
const statPhrase = (
    label: string,
    total: number,
    unit: string,
    valueType: MatchSummary["stats"][number]["value_type"]
): string => {
    // Grouped only for whole numbers: `groupThousands` rounds, which would turn
    // 10.5km into 11km.
    const value =
        valueType === "integer"
            ? groupThousands(total)
            : formatStatValue(total, valueType)

    // A unit is a symbol ("km"), so it butts up against the number and never
    // takes an "s". A name is a word and does.
    if (unit) return `${value}${unit}`

    return `${value} ${(total === 1 ? singular(label) : label).toLowerCase()}`
}

export type SeasonSummaryCardProps = {
    summary: MatchSummary
    /** From the diary settings row; omitted when the viewer has no business with it. */
    streakWeeks?: number
    /** Years the caller can prove the player has entries in. Empty hides the picker. */
    years?: number[]
    /** The selected year, or null for all time. */
    year?: number | null
    onYearChange?: (year: number | null) => void
    /**
     * Owner's own card. Changes the voice — and gates the form sparkline.
     *
     * `summary.form` is the only thing in this payload that is NOT an
     * aggregate: it is ten individual self-ratings, one per match, in order.
     * The rest of the card is totals, and totals are what the showcase toggle
     * publishes. A run of 2s is the most personal number in the diary — how a
     * player felt about their own performance, match by match — and a visiting
     * recruiter reading it match-by-match is a different disclosure from
     * reading a season total.
     *
     * So the chart is the owner's. The API sends `form` to a visitor and the
     * backend calls the whole payload aggregates; this is the client declining
     * to render the one field where that is not quite true.
     */
    isOwn?: boolean
}

export default function SeasonSummaryCard({
    summary,
    streakWeeks,
    years = [],
    year = null,
    onYearChange,
    isOwn = false,
}: SeasonSummaryCardProps) {
    const {
        total_matches: totalMatches,
        wins,
        draws,
        losses,
        minutes_total: minutesTotal,
        stats,
    } = summary

    // ── Headline ──────────────────────────────────────────────

    const statFigures = stats
        .filter((stat) => stat.total > 0)
        .map((stat) =>
            statPhrase(
                stat.name,
                stat.total,
                stat.unit,
                stat.value_type
            )
        )

    // Minutes are last in the queue rather than absent: for a player who logs
    // no stats at all it is the only other number they have, and "12 matches"
    // on its own is a thin headline.
    const extras = [
        ...statFigures,
        ...(minutesTotal > 0
            ? [`${groupThousands(minutesTotal)} minutes`]
            : []),
    ].slice(0, HEADLINE_EXTRAS)

    // ── Results bar ───────────────────────────────────────────

    // A friendly nobody kept score in is logged with no result, so the recorded
    // results can be fewer than the matches. The fourth band keeps the bar's
    // proportions honest instead of quietly rescaling three numbers to 100%.
    const unrecorded = Math.max(0, totalMatches - wins - draws - losses)

    const bands = [
        { key: "win", label: "W", count: wins },
        { key: "draw", label: "D", count: draws },
        { key: "loss", label: "L", count: losses },
        { key: "none", label: "no result", count: unrecorded },
    ].filter((band) => band.count > 0)

    const showStreak =
        streakWeeks !== undefined && streakWeeks >= MIN_STREAK_WEEKS

    return (
        <div
            className={`${styles.card} ${stats.length > 0 ? styles.cardSplit : ""}`}
        >
            {/* ── Left: the season at a glance ── */}
            <div className={styles.primary}>
                <div className={styles.topRow}>
                    <span className={styles.eyebrow}>
                        {year ? year : "All time"}
                    </span>

                    {years.length > 1 && onYearChange && (
                        <>
                            <label
                                className="sr-only"
                                htmlFor="match-summary-year"
                            >
                                Show a different year
                            </label>
                            <select
                                id="match-summary-year"
                                className={styles.yearSelect}
                                value={year ?? ""}
                                onChange={(event) =>
                                    onYearChange(
                                        event.target.value
                                            ? Number(event.target.value)
                                            : null
                                    )
                                }
                            >
                                <option value="">All time</option>
                                {years.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                </div>

                {/* The separators are real elements with real spaces around
                    them, not a CSS ::before. Two reasons, and neither is
                    cosmetic: without whitespace between the spans the line has
                    no break opportunity at all and overflows a 320px card, and
                    generated content is not something to rely on a screen
                    reader spacing correctly. Each figure is nowrap, so the line
                    breaks BETWEEN numbers and never through one. */}
                <p className={styles.headline}>
                    <span className={styles.headlineLead}>
                        {groupThousands(totalMatches)}
                    </span>{" "}
                    {totalMatches === 1 ? "match" : "matches"}
                    {extras.map((figure) => (
                        <Fragment key={figure}>
                            {" "}
                            <span
                                className={styles.headlineSep}
                                aria-hidden="true"
                            >
                                ·
                            </span>{" "}
                            <span className={styles.headlinePart}>
                                {figure}
                            </span>
                        </Fragment>
                    ))}
                </p>

                {bands.length > 0 && (
                    <div className={styles.results}>
                        {/* The shape of a season reads faster than its digits —
                            which is why this is a bar and not three numbers. */}
                        <div
                            className={styles.bar}
                            role="img"
                            aria-label={
                                `${wins} won, ${draws} drawn, ${losses} lost` +
                                (unrecorded > 0
                                    ? `, ${unrecorded} with no result recorded`
                                    : "")
                            }
                        >
                            {bands.map((band) => (
                                <span
                                    key={band.key}
                                    className={styles.band}
                                    data-tone={band.key}
                                    style={{
                                        flexGrow: band.count,
                                    }}
                                />
                            ))}
                        </div>

                        <ul className={styles.legend} aria-hidden="true">
                            {bands.map((band) => (
                                <li key={band.key} className={styles.legendItem}>
                                    <span
                                        className={styles.legendDot}
                                        data-tone={band.key}
                                    />
                                    {band.count} {band.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Owner only — see `isOwn`. */}
                {isOwn && (
                    <FormTrend ratings={summary.form} className={styles.form} />
                )}

                {showStreak && (
                    <p className={styles.streak}>
                        <Icon
                            icon="mdi:fire"
                            width={16}
                            height={16}
                            aria-hidden="true"
                        />
                        <span>
                            {isOwn ? "You've played" : "Played"} {streakWeeks}{" "}
                            weeks running
                        </span>
                    </p>
                )}
            </div>

            {/* ── Right: everything they logged ── */}
            {stats.length > 0 && (
                <div className={styles.statGrid}>
                    {stats.map((stat) => (
                        <div key={stat.stat_field_id} className={styles.statTile}>
                            <span className={styles.statValue}>
                                {formatStatValue(stat.total, stat.value_type)}
                                {stat.unit && (
                                    <span className={styles.statUnit}>
                                        {stat.unit}
                                    </span>
                                )}
                            </span>
                            <span className={styles.statLabel}>{stat.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * The card's own skeleton, at the card's own height.
 *
 * Lives here so it cannot drift from the thing it stands in for — the profile
 * must not jump when the summary lands, and the surest way to keep two heights
 * equal is to make them impossible to edit apart.
 */
export function SeasonSummaryCardSkeleton() {
    return (
        <div
            className={`${styles.card} ${styles.skeleton}`}
            aria-hidden="true"
        >
            <div className={styles.primary}>
                <span className={styles.skelEyebrow} />
                <span className={styles.skelHeadline} />
                <span className={styles.skelBar} />
                <span className={styles.skelLegend} />
            </div>
        </div>
    )
}
