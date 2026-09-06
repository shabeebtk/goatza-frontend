/**
 * The deadline countdown behind the status chip.
 *
 * A pure function of (deadline, status, now) rather than a hook reading the
 * clock itself, because the interesting cases are all about WHEN you look:
 * two days out, six hours out, the minute after it closed. A component that
 * calls `dayjs()` internally can only be tested by mocking time; this can be
 * asked directly.
 *
 * `now` is injected for the same reason. The component passes a ticking value.
 */

import dayjs from "dayjs"

/** Drives the chip's colour: green and pulsing, or red and still. */
export type CountdownTone = "open" | "closed"

export interface Countdown {
    label: string
    tone: CountdownTone
}

/** Statuses that mean "not taking applications", whatever the deadline says. */
const CLOSED_STATUSES = new Set(["closed", "cancelled"])

/**
 * The chip's text and tone, or null when there is nothing to say — an active
 * posting with no deadline has no countdown, and an empty red chip claiming
 * "Closed" would be a lie invented from missing data.
 */
export function formatCountdown(
    deadline: string | null | undefined,
    status: string | null | undefined,
    now: Date | number = Date.now()
): Countdown | null {
    const closedByStatus = !!status && CLOSED_STATUSES.has(status)
    const end = deadline ? dayjs(deadline) : null
    const current = dayjs(now)
    const passed = end ? !end.isAfter(current) : false

    // A deadline that has PASSED is a date we can name, and naming it tells a
    // player whether they missed it by a day or by a season.
    if (passed) {
        return { label: `Closed ${end!.format("D MMM")}`, tone: "closed" }
    }

    // Closed EARLY by the organiser, with time still on the clock. The
    // deadline is not the closing date here — it is a date in the future — so
    // labelling it "Closed 13 Aug" would announce a closure that has not
    // happened yet. We are not told when they closed it, so we do not guess.
    if (closedByStatus) {
        return { label: "Closed", tone: "closed" }
    }

    if (!end) return null

    const ms = end.diff(current)
    const totalMinutes = Math.floor(ms / 60000)
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
    const minutes = totalMinutes % 60

    // Under a minute is still open, and rounding it to "0m" reads as expired.
    if (totalMinutes < 1) return { label: "Closing now", tone: "open" }
    // Over a day, minutes are noise — "2d 6h" is what a person plans around.
    if (days > 0) return { label: `Closes in ${days}d ${hours}h`, tone: "open" }
    // Inside the last day the unit shifts down, which is the point at which
    // hours start to matter.
    if (hours > 0) return { label: `Closes in ${hours}h ${minutes}m`, tone: "open" }
    return { label: `Closes in ${minutes}m`, tone: "open" }
}

/**
 * How often the chip should re-render to stay honest.
 *
 * Days out, a minute-by-minute tick is wasted work on a page that is mostly
 * read and left; inside the last hour it is the whole point of the chip.
 */
export function countdownTickMs(countdown: Countdown | null): number | null {
    if (!countdown || countdown.tone === "closed") return null
    // Anything showing minutes has to move every minute; "2d 6h" only needs to
    // be right to the hour.
    return countdown.label.includes("d ") ? 60_000 * 5 : 30_000
}
