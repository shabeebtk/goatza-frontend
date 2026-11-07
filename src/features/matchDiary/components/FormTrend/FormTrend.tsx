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
 * aria-label that says in words what the shape says visually.
 *
 * It fills the card's width, so the SVG stretches sideways
 * (`preserveAspectRatio="none"`). A stretched circle is an ellipse, so the dots
 * are HTML placed at the same coordinates, and the strokes opt out of the scaling
 * with `non-scaling-stroke`. x is a percentage of the width, y is real pixels.
 */

import { FORM_LENGTH, SELF_RATING_MAX, SELF_RATING_MIN } from "../../types"
import styles from "./FormTrend.module.css"

/** Below this a line is two dots and an opinion. */
const MIN_RATED_MATCHES = 3

const CHART_HEIGHT = 44
const PAD_X_PERCENT = 3
const PAD_Y = 7

/** The ratings the faint guide lines sit on. */
const GUIDE_RATINGS = [SELF_RATING_MIN, 3, SELF_RATING_MAX]

/** A rating (1-5) to a y coordinate — 5 at the top, 1 at the bottom. */
const yFor = (rating: number): number => {
    const span = SELF_RATING_MAX - SELF_RATING_MIN
    const fraction = (rating - SELF_RATING_MIN) / span
    return PAD_Y + (1 - fraction) * (CHART_HEIGHT - PAD_Y * 2)
}

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
    // Defensive slice: the API already caps this at FORM_LENGTH, and an evenly
    // spaced chart of more than that would only squeeze the dots together.
    const recent = ratings.slice(-FORM_LENGTH)
    const rated = recent.filter((rating): rating is number => rating !== null)

    if (rated.length < MIN_RATED_MATCHES) return null

    const runs = ratedRuns(recent)
    const lastRatedIndex = runs[runs.length - 1].at(-1)?.index

    const xFor = (index: number): number =>
        PAD_X_PERCENT +
        (index / Math.max(1, recent.length - 1)) * (100 - PAD_X_PERCENT * 2)

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

            {/* One figure, one label. What is inside is decoration once the
                sentence says the same thing. */}
            <div
                className={styles.chart}
                style={{ height: CHART_HEIGHT }}
                role="img"
                aria-label={label}
            >
                <svg
                    className={styles.svg}
                    viewBox={`0 0 100 ${CHART_HEIGHT}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                >
                    {GUIDE_RATINGS.map((rating) => (
                        <line
                            key={rating}
                            className={styles.guide}
                            x1={0}
                            x2={100}
                            y1={yFor(rating)}
                            y2={yFor(rating)}
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}

                    {runs
                        .filter((run) => run.length > 1)
                        .map((run) => (
                            <polyline
                                key={run[0].index}
                                className={styles.line}
                                points={run
                                    .map(
                                        (point) =>
                                            `${xFor(point.index)},${yFor(point.rating)}`
                                    )
                                    .join(" ")}
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                </svg>

                {runs.flat().map((point) => (
                    <span
                        key={point.index}
                        className={`${styles.dot} ${point.index === lastRatedIndex ? styles.dotLast : ""}`}
                        data-dot=""
                        style={{
                            left: `${xFor(point.index)}%`,
                            top: yFor(point.rating),
                        }}
                        aria-hidden="true"
                    />
                ))}
            </div>
        </div>
    )
}
