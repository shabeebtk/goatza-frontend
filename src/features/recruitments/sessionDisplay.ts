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
 * A recruitment as the WHOLE-TRIAL questions below read it: its own venue,
 * plus the dates that may each have one of their own.
 *
 * `nearest_session` is served by the LIST endpoint only. The detail payload
 * answers the same question differently — a `distance_km` on every centre —
 * so `nearestCentre` reads whichever one it is handed. Both are absent for an
 * anonymous reader, who has no location for the server to measure from.
 */
type TrialContext = VenueContext & {
    sessions?: TrialSession[]
    nearest_session?: (TrialSession & { distance_km?: number | null }) | null
}

/**
 * A real INSTANT — a deadline, a close time — as the clock at the venue read
 * it, which is the only clock the trial's own copy ever refers to.
 *
 * Separate from `formatSessionDate` because the two take different things. A
 * session's `date` is a calendar day with no instant behind it and its
 * `start_time` is a wall clock; a deadline is a UTC moment that genuinely has
 * to be converted. Converting the first pair is the bug this file exists to
 * stop, and NOT converting this one is the bug it exists to stop next.
 *
 * `Intl` rather than dayjs: no dayjs timezone plugin is installed, so a bare
 * `dayjs(iso)` silently renders the BROWSER's zone — a London trial closing
 * at 6 pm reads as 11:30 pm to an Indian viewer.
 */
export function formatInstant(
    iso: string | null | undefined,
    timeZone: string,
    options: Intl.DateTimeFormatOptions,
): string | null {
    if (!iso) return null
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return null
    return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(
        parsed,
    )
}

/** Dates that still count: not cancelled. Order untouched. */
export function liveSessions(
    sessions: TrialSession[] | undefined,
): TrialSession[] {
    if (!sessions) return []
    return sessions.filter(session => !session.is_cancelled)
}

/**
 * THE DATE THE TRIAL STARTS ON, as a session — the earliest live one.
 *
 * This is what every "Trial · 10 OCT" fact should be built from rather than
 * `event_date`. They name the same day, but a session carries a date-only
 * string and a wall-clock time, which the zone-aware formatters above read
 * correctly; `event_date` is an instant with a 23:59 "no time given"
 * sentinel buried in it, written in the VENUE's zone and therefore
 * undetectable on the reader's clock.
 */
export function firstLiveSession(
    sessions: TrialSession[] | undefined,
): TrialSession | null {
    const [first] = liveSessions(orderedSessions(sessions))
    return first ?? null
}

/**
 * How a centre is IDENTIFIED for the purpose of "is this one place or four":
 * its resolved venue name, or the city when it has no name of its own.
 *
 * Lower-cased and trimmed, so "Corporation Stadium" and "corporation
 * stadium " are one ground. Deliberately NOT the coordinates: two rows at
 * one stadium can carry two different pins and still be one place to a
 * player deciding where to travel.
 */
function centreKey(session: TrialSession): string {
    const venue = session.venue_name?.trim() || session.city?.trim() || ""
    return venue.toLowerCase()
}

/**
 * A CITY TOUR rather than several days at one ground.
 *
 * Two or more live dates that do not all resolve to the same place. The row
 * count alone cannot answer this — a screening round and a final at one
 * stadium are two dates and one venue — and `session_mode` cannot either: a
 * tour is `choose_one`, but so is "pick whichever of our two Saturdays suits
 * you" at a single ground.
 *
 * It is what decides whether the hero's "Venue" fact is a fact at all, and
 * whether the apply form asks for a date or a CENTRE.
 */
export function isMultiPlace(recruitment: TrialContext): boolean {
    const live = liveSessions(recruitment.sessions)
    if (live.length < 2) return false
    return new Set(live.map(centreKey)).size > 1
}

/** Every city a tour visits, in date order, each one once. */
export function centreCities(recruitment: TrialContext): string[] {
    const seen = new Set<string>()
    const cities: string[] = []
    for (const session of liveSessions(orderedSessions(recruitment.sessions))) {
        const city = session.city?.trim() || session.venue_name?.trim() || ""
        if (!city) continue
        const key = city.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        cities.push(city)
    }
    return cities
}

/**
 * "Kochi · Kozhikode · Kannur…" — where a tour goes, for one line under the
 * centre count.
 *
 * Three and then an ellipsis: the facts strip gives this a single line, and
 * TrialDatesList directly below it lists every centre in full, so the job
 * here is to say "it is these kinds of places", not to be the list.
 */
export function centresLine(recruitment: TrialContext): string | null {
    const cities = centreCities(recruitment)
    if (cities.length === 0) return null
    const shown = cities.slice(0, 3).join(" · ")
    return cities.length > 3 ? `${shown}…` : shown
}

/**
 * THE CENTRE THIS READER CAN ACTUALLY GET TO, with its distance.
 *
 * Prefers the server's own answer (`nearest_session`, on the list payload)
 * and otherwise picks the closest measured centre off `sessions`, which is
 * how the DETAIL payload carries the same information. Null when nothing was
 * measured — an anonymous reader, or a trial whose centres have no
 * coordinates — and null must read as nothing: an unknown distance is not a
 * short one.
 */
export function nearestCentre(
    recruitment: TrialContext,
): (TrialSession & { distance_km?: number | null }) | null {
    const served = recruitment.nearest_session
    if (served && served.distance_km != null) return served

    const measured = liveSessions(recruitment.sessions).filter(
        session => session.distance_km != null,
    )
    if (measured.length === 0) return null
    return sessionsByDistance(measured)[0] ?? null
}

/**
 * "Nearest: Kozhikode · 12 km" — the one line a player on a four-city tour
 * wants, in place of a list of cities they have to measure themselves.
 *
 * The place is named BEFORE the number, because "12 km" answers nothing
 * until you know 12 km to where. Null whenever nothing was measured, and the
 * caller falls back to `centresLine`.
 */
export function nearestCentreLine(recruitment: TrialContext): string | null {
    const centre = nearestCentre(recruitment)
    if (!centre || centre.distance_km == null) return null
    const place = centre.city?.trim() || centre.venue_name?.trim()
    if (!place) return null
    return `Nearest: ${place} · ${formatDistance(centre.distance_km)}`
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

/**
 * The one line that says how a multi-date trial is attended.
 *
 * `multiPlace` changes the NOUN, not the rule. "Pick one date" is true of a
 * city tour and useless to a player reading it: the dates are not what they
 * are choosing between — four grounds in four cities are — and the one they
 * can reach is the only question they have. Callers pass `isMultiPlace(r)`.
 */
export function sessionModeLine(
    mode: "all" | "choose_one" | undefined,
    multiPlace = false,
): string | null {
    if (mode === "choose_one") {
        return multiPlace
            ? "Pick one centre when you apply"
            : "Pick one date when you apply"
    }
    if (mode === "all") return "Attend all dates"
    return null
}
