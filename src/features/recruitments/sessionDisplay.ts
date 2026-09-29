/**
 * How a trial DATE reads on screen — one place, so the apply picker, the
 * detail page, the public page and My applications all say it the same way.
 *
 * The dates themselves arrive already resolved: the server substitutes the
 * recruitment's venue into any date that set none, so nothing here has to
 * fall back. What this file decides is what is worth SHOWING — and the answer
 * is "whatever differs from the trial's own venue", because repeating
 * "Corporation Stadium" under all three dates tells a player nothing, while
 * "Kochi / Kozhikode / Kannur" is the entire point of a city tour.
 *
 * Every day comparison goes through `kolkataDay` from trialEnded.ts. There is
 * exactly one calendar on this product and it is the venue's.
 */

import type {
    ApplicationSession,
    TrialSession,
} from "./services/recruitments.api"
import { TRIAL_TIME_ZONE, kolkataDay } from "./trialEnded"

/** Anything with the date fields — a trial date or the one on an application. */
type SessionLike = TrialSession | ApplicationSession

/** The trial's own venue, which a date only mentions when it differs. */
type VenueContext = {
    venue_name?: string
    city?: string
}

/** "Sat 10 Oct" — a date as the venue reads it. */
export function formatSessionDate(date: string): string {
    // A bare "YYYY-MM-DD" is parsed as UTC midnight, so format it in the
    // trial's zone to get the day back out unshifted.
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return date
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: TRIAL_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed)
}

/** "9:00 am" from "09:00:00". Null when the date carries no time. */
export function formatSessionTime(time: string | null | undefined): string | null {
    if (!time) return null
    const [hours, minutes] = time.split(":")
    const hour = Number(hours)
    if (Number.isNaN(hour)) return null
    const suffix = hour < 12 ? "am" : "pm"
    const display = hour % 12 === 0 ? 12 : hour % 12
    return `${display}:${minutes ?? "00"} ${suffix}`
}

/** "9:00 am – 1:00 pm", "9:00 am", or null. */
export function formatSessionTimeRange(session: SessionLike): string | null {
    const start = formatSessionTime(session.start_time)
    const end = "end_time" in session ? formatSessionTime(session.end_time) : null
    if (start && end) return `${start} – ${end}`
    return start
}

/**
 * Where this date is, but ONLY when it is somewhere else. A date at the
 * trial's own ground says nothing; a date in another city says everything.
 */
export function sessionPlace(
    session: SessionLike,
    recruitment: VenueContext,
): string | null {
    const venue = session.venue_name?.trim()
    const city = session.city?.trim()

    if (venue && venue !== recruitment.venue_name?.trim()) return venue
    if (city && city !== recruitment.city?.trim()) return city
    return null
}

/** "Sat 10 Oct · 9:00 am · Kochi" — the apply picker's one-line option. */
export function sessionOptionLabel(
    session: SessionLike,
    recruitment: VenueContext,
): string {
    return [
        formatSessionDate(session.date),
        formatSessionTimeRange(session),
        sessionPlace(session, recruitment),
        session.title?.trim() || null,
    ]
        .filter(Boolean)
        .join(" · ")
}

/**
 * Dates a player may still pick: not cancelled, not in the past on the
 * venue's calendar. Today counts — a trial at 9am is still pickable at 8am,
 * and the server applies exactly this rule.
 */
export function upcomingSessions(
    sessions: TrialSession[] | undefined,
    now: Date | number = Date.now(),
): TrialSession[] {
    if (!sessions) return []
    const today = kolkataDay(now)
    return sessions.filter(
        session => !session.is_cancelled && (!today || session.date >= today),
    )
}

/**
 * Every date, cancelled ones last. The API already orders them this way; the
 * sort is here so a payload from anywhere else renders the same.
 */
export function orderedSessions(
    sessions: TrialSession[] | undefined,
): TrialSession[] {
    if (!sessions) return []
    return [...sessions].sort((a, b) => {
        if (a.is_cancelled !== b.is_cancelled) return a.is_cancelled ? 1 : -1
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return (a.start_time ?? "23:59") < (b.start_time ?? "23:59") ? -1 : 1
    })
}

/** The one line that says how a multi-date trial is attended. */
export function sessionModeLine(
    mode: "all" | "choose_one" | undefined,
): string | null {
    if (mode === "choose_one") return "Pick one date when you apply"
    if (mode === "all") return "Attend all dates"
    return null
}
