/**
 * Achievements — date formatting.
 *
 * Careers are talked about in months over a span ("Jun 2023 – Present · 1 yr");
 * an achievement is a single day, and the day matters — "the final was on the
 * 14th" is how people remember it. So this is a full date, not the month
 * precision `careerDates` uses, and there is no duration to compute.
 *
 * `toCalendarDate` is deliberately NOT redefined here: it belongs to the career
 * feature and is imported where needed.
 */

import dayjs from "dayjs"

/** "14 May 2024", or the raw string when the API sends something unparseable. */
export const formatAchievedDate = (isoDate: string): string => {
    const parsed = dayjs(isoDate)
    return parsed.isValid() ? parsed.format("D MMM YYYY") : isoDate
}

/** "May 2024" — the compact form, for dense rows like the review queue. */
export const formatAchievedMonth = (isoDate: string): string => {
    const parsed = dayjs(isoDate)
    return parsed.isValid() ? parsed.format("MMM YYYY") : isoDate
}

/**
 * Today as `YYYY-MM-DD` in the viewer's timezone — the same shape
 * `<input type="date">` emits, so it can be used directly as a `max`.
 *
 * Built from the local calendar fields rather than `toISOString()`, which would
 * shift to UTC and hand someone in UTC+5:30 a `max` of yesterday for the first
 * half of their day.
 */
export const todayForInput = (): string => dayjs().format("YYYY-MM-DD")
