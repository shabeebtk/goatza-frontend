"use client"

/**
 * FormTrend — the last ten self-ratings as a sparkline, oldest to newest.
 *
 * THE GAPS ARE THE POINT. `form` arrives from the API with its nulls kept, and
 * they stay kept: a match nobody rated breaks the line rather than being
 * interpolated across. Joining the dots either side of a gap would draw a
 * rating the player never gave — a small lie, but a lie about the one number on
 * this card that is purely their own opinion, and the summary is supposed to be
 * the thing they are willing to show a coach.
 *
 * Hidden below three rated matches. Two points is a line segment, not a trend,
 * and a chart that appears after one match makes the diary look like it is
 * guessing at something.
 *
 * A sparkline is nothing to a screen reader, so the whole thing carries an
 * aria-label that says in words what the shape says visually, and the SVG
 * itself is hidden from the tree.
 */

import { FORM_LENGTH, SELF_RATING_MAX, SELF_RATING_MIN } from "../../types"
import styles from "./FormTrend.module.css"

/** Below this a line is two dots and an opinion. */
const MIN_RATED_MATCHES = 3

// Geometry in user units; the SVG scales as a block but is drawn at this size
// so the dots stay round rather than being stretched by a non-uniform fit.
const STEP = 14
const PAD_X = 4
const PAD_Y = 4
const PLOT_HEIGHT = 26

/** A rating (1-5) to a y coordinate — 5 at the top, 1 at the bottom. */
const yFor = (rating: number): number => {
    const span = SELF_RATING_MAX - SELF_RATING_MIN
    const fraction = (rating - SELF_RATING_MIN) / span
    return PAD_Y + (1 - fraction) * PLOT_HEIGHT
}

const xFor = (index: number): number => PAD_X + index * STEP

const mean = (values: number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length

/** One decimal, no trailing ".0" — 3.5 stays 3.5, 4.0 reads as 4. */
const oneDecimal = (value: number): string =>
    String(Math.round(value * 10) / 10)

/**
 * Runs of CONSECUTIVE rated matches. Each run is drawn as its own polyline, so
 * an unrated match between two rated ones leaves a visible break.
 */
const ratedRuns = (
    ratings: (number | null)[]
): { index: number; rating: number }[][] => {
    const runs: { index: number; rating: number }[][] = []
    let current: { index: number; rating: number }[] = []

    ratings.forEach((rating, index) => {
        if (rating === null) {
            if (current.length) runs.push(current)
            current = []
            return
        }
        current.push({ index, rating })
    })

    if (current.length) runs.push(current)
    return runs
}

/**
 * The trend in words, for the aria-label.
 *
 * First half against second half of the RATED values, ignoring where the gaps
 * fell — comparing positions would let an unrated stretch read as a slump.
 */
const describeTrend = (rated: number[]): string => {
    const half = Math.floor(rated.length / 2)
    const earlier = mean(rated.slice(0, half))
    const later = mean(rated.slice(rated.length - half))
    const shift = later - earlier

    if (shift >= 0.5) return "trending up"
    if (shift <= -0.5) return "trending down"
    return "holding steady"
}

export default function FormTrend({
    ratings,
    className,
}: {
    /** `summary.form` — up to ten ratings, OLDEST FIRST, nulls kept. */
    ratings: (number | null)[]
    className?: string
}) {
    // Defensive slice: the API already caps this at FORM_LENGTH, but the chart's
    // width is computed from the array and a longer one would push the card
    // sideways rather than fail loudly.
    const recent = ratings.slice(-FORM_LENGTH)
    const rated = recent.filter((rating): rating is number => rating !== null)

    if (rated.length < MIN_RATED_MATCHES) return null

    const runs = ratedRuns(recent)
    const width = PAD_X * 2 + Math.max(0, recent.length - 1) * STEP
    const height = PAD_Y * 2 + PLOT_HEIGHT

    const average = oneDecimal(mean(rated))
    const label =
        `Your form over your last ${recent.length} matches: ` +
        `${rated.length} rated, averaging ${average} out of ${SELF_RATING_MAX}, ` +
        `${describeTrend(rated)}.` +
        (rated.length < recent.length
            ? ` ${recent.length - rated.length} not rated.`
            : "")

    return (
        <div className={`${styles.wrap} ${className ?? ""}`}>
            <span className={styles.label}>
                Form
                <span className={styles.average}>
                    avg {average}/{SELF_RATING_MAX}
                </span>
            </span>

            {/* One figure, one label. The SVG is decoration once the sentence
                above it says the same thing. */}
            <div className={styles.chart} role="img" aria-label={label}>
                <svg
                    className={styles.svg}
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    aria-hidden="true"
                    focusable="false"
                >
                    {runs.map((run) => (
                        <g key={run[0].index}>
                            {run.length > 1 && (
                                <polyline
                                    className={styles.line}
                                    points={run
                                        .map(
                                            (point) =>
                                                `${xFor(point.index)},${yFor(point.rating)}`
                                        )
                                        .join(" ")}
                                />
                            )}
                            {run.map((point) => (
                                <circle
                                    key={point.index}
                                    className={styles.dot}
                                    cx={xFor(point.index)}
                                    cy={yFor(point.rating)}
                                    r={2.2}
                                />
                            ))}
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    )
}
