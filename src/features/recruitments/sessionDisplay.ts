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
 * THE CALENDAR IS THE VENUE'S, one per recruitment — not one for the
 * product. Every day comparison goes through `trialDay` from trialEnded.ts
 * with that recruitment's own `timezone`, so a London trial names London's
 * calendar day and a Kochi one names Kochi's.
 *
 * Which is why the zone is an argument everywhere below rather than a module
 * constant: a constant is a zone somebody forgets to think about, and the way
 * it fails is silent — the date renders, it is just the wrong day.
 */

import type {
    ApplicationSession,
    TrialSession,
} from "./services/recruitments.api"
import { formatDistance } from "./matchContext"
import { FALLBACK_TRIAL_TIME_ZONE, trialDay } from "./trialEnded"

/** Anything with the date fields — a trial date or the one on an application. */
type SessionLike = TrialSession | ApplicationSession

/** The trial's own venue, which a date only mentions when it differs. */
type VenueContext = {
    venue_name?: string
    city?: string
    /**
     * The venue's IANA zone — what its dates are read in. Optional only
     * because a payload cached before the field shipped has none; anything
     * holding a live recruitment has it.
     */
    timezone?: string
}

/**
 * "Sat 10 Oct" — a date as THE VENUE reads it.
 *
 * `timeZone` is required and deliberately has no default: this is the
 * function a new call site reaches for, and a default would let it render an
 * Indian day for a London trial without anybody noticing.
 */
export function formatSessionDate(date: string, timeZone: string): string {
    // A bare "YYYY-MM-DD" is parsed as UTC midnight, so format it in the
    // trial's zone to get the day back out unshifted.
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return date
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed)
}

/**
 * "9:00 am" from "09:00:00". Null when the date carries no time.
 *
 * NO ZONE, and that is not an omission. `start_time` is a WALL CLOCK at the
 * venue already — the server stores the time the org typed, not an instant —
 * so there is nothing to convert, and converting it would be the bug: 9:00 at
 * a London ground would come out as 2:30 pm on an Indian clock.
 */
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

/**
 * "Sat 10 Oct · 9:00 am · Kochi" — the apply picker's one-line option.
 *
 * Takes the zone off the recruitment it is already given, so its callers did
 * not change when the zone arrived.
 */
export function sessionOptionLabel(
    session: SessionLike,
    recruitment: VenueContext,
): string {
    return [
        formatSessionDate(
            session.date,
            recruitment.timezone || FALLBACK_TRIAL_TIME_ZONE,
        ),
        formatSessionTimeRange(session),
        sessionPlace(session, recruitment),
        session.title?.trim() || null,
        // LAST, and only when the server measured it. The place has to be
        // read first — "4 km" answers nothing until you know 4 km to where —
        // and an anonymous reader simply sees the line without it.
        "distance_km" in session && session.distance_km != null
            ? formatDistance(session.distance_km)
            : null,
    ]
        .filter(Boolean)
        .join(" · ")
}

/**
 * THE CENTRES, NEAREST FIRST — a copy, sorted; the input is untouched.
 *
 * Date order answers "when is this trial", and that is not the question a
 * player with a four-city tour in front of them is asking. Theirs is "where
 * can I actually get to", so the centre 4 km away goes first even if its date
 * is last. The distance is served (the viewer's coordinates live on the
 * server, not here), so a payload without one sorts exactly as before.
 *
 * Centres with no distance go LAST as a group rather than first: an unknown
 * distance is not a short one. Inside each group the existing date ordering
 * decides, which is also what the whole list falls back to when the server
 * measured nothing.
 */
export function sessionsByDistance(sessions: TrialSession[]): TrialSession[] {
    return [...sessions].sort((a, b) => {
        const da = a.distance_km ?? null
        const db = b.distance_km ?? null

        if (da !== db) {
            if (da === null) return 1
            if (db === null) return -1
            return da - db
        }

        // Same distance, or neither measured: the ordering this list already
        // had. Restated rather than shared with orderedSessions because that
        // one also groups cancelled dates last, and nothing cancelled ever
        // reaches here.
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return (a.start_time ?? "23:59") < (b.start_time ?? "23:59") ? -1 : 1
    })
}

/**
 * Dates a player may still pick: not cancelled, not in the past on the
 * venue's calendar. Today counts — a trial at 9am is still pickable at 8am,
 * and the server applies exactly this rule.
 *
 * `timeZone` is required, and it is load-bearing rather than cosmetic here:
 * "today" is a DIFFERENT day either side of midnight at the venue, so the
 * wrong zone does not misspell a label — it adds or drops a whole date from
 * what the player is offered.
 */
export function upcomingSessions(
    sessions: TrialSession[] | undefined,
    timeZone: string,
    now: Date | number = Date.now(),
): TrialSession[] {
    if (!sessions) return []
    const today = trialDay(now, timeZone)
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
