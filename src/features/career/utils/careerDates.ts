/**
 * Career — date range + duration formatting.
 *
 * Month precision throughout, matching how careers are actually talked about:
 * "Jun 2023 – Present · 1 yr 2 mos", never a day-of-month.
 */

import dayjs from "dayjs"

import type { CareerEntry } from "../types"

/** What the timeline shows on the right of the dash for an unfinished stint. */
const PRESENT = "Present"

type CareerDates = Pick<CareerEntry, "start_date" | "end_date" | "is_current">

/**
 * "Jun 2023 – Present" / "Aug 2019 – Mar 2021".
 *
 * An entry with no end date reads as Present whether or not `is_current` is
 * set. The two are not the same flag server-side — `is_current` is the player
 * saying "I'm still here", a null `end_date` just means they never gave one —
 * but neither has ended, and the ordering selector already treats both as
 * running to today.
 */
export const formatCareerRange = (entry: CareerDates): string => {
    const start = dayjs(entry.start_date)
    const startLabel = start.isValid()
        ? start.format("MMM YYYY")
        : entry.start_date

    if (entry.is_current || !entry.end_date) {
        return `${startLabel} – ${PRESENT}`
    }

    const end = dayjs(entry.end_date)
    return `${startLabel} – ${end.isValid() ? end.format("MMM YYYY") : entry.end_date}`
}

const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? "" : "s"}`

/**
 * "1 yr 2 mos" / "8 mos" / "2 yrs", or null when the stint is under a month —
 * "0 mos" next to a date range says nothing worth the space.
 *
 * An open-ended entry is measured to today, which is what makes a current
 * stint's duration tick up on its own.
 */
/**
 * An ISO timestamp → the calendar date the SERVER would derive from it.
 *
 * `event_date` is a datetime; every other date in this feature is a calendar
 * date. Converting one to the other has to pick a timezone, and running it
 * through `dayjs()` picks the browser's — which lands a day off from the
 * backend for anything late in the UTC day (Django runs on TIME_ZONE="UTC",
 * and `timezone.localdate()` is what it uses for the same fallback). Slicing
 * the UTC portion of the ISO string agrees with the server by construction.
 */
export const toCalendarDate = (isoTimestamp: string): string =>
    isoTimestamp.slice(0, 10)

export const careerDuration = (entry: CareerDates): string | null => {
    const start = dayjs(entry.start_date)
    if (!start.isValid()) return null

    const rawEnd =
        entry.is_current || !entry.end_date ? dayjs() : dayjs(entry.end_date)
    const end = rawEnd.isValid() ? rawEnd : dayjs()

    const months = end.diff(start, "month")
    if (months < 1) return null

    const years = Math.floor(months / 12)
    const remainder = months % 12

    if (years === 0) return plural(remainder, "mo")
    if (remainder === 0) return plural(years, "yr")

    return `${plural(years, "yr")} ${plural(remainder, "mo")}`
}
