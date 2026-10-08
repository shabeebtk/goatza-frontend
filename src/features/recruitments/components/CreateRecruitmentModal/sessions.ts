/**
 * The wizard's TRIAL DATES — the draft row, the payload it becomes, and the
 * rules the server will apply to it.
 *
 * A trial used to have one date, stored on the recruitment as `event_date`.
 * It now has a list, and `event_date` is DERIVED from the first of them. The
 * default is still exactly one row, presented like the single date field
 * always was: most orgs never add a second, and the step must not feel
 * heavier for them.
 *
 * THE ONE THING NOT TO BREAK: `id`. A row loaded from the API carries the
 * server's id, and that id must round-trip in the payload. The backend
 * DIFF-SYNCS on it — a row that keeps its id is updated in place, a row that
 * arrives without one is created, and a row the payload dropped is DELETED,
 * which SET_NULLs the date every applicant picked. A date row that loses its
 * id on the way through the wizard silently wipes the answer every applicant
 * gave. `key` is the local React key and is never sent.
 *
 * Dates are parsed with wizardDate's `parseLocalInput`, never a second
 * parser: a date with no time means "that whole day" and resolves to 23:59,
 * which is the same sentinel the server writes.
 */

import type { PlaceResult } from "@/shared/services/places.service"
import type {
    CreateTrialSessionPayload,
    SessionMode,
    TrialSession,
    TrialSessionLocation,
} from "../../services/recruitments.api"
import { parseLocalInput } from "./wizardDate"

/**
 * WHAT SHAPE THIS TRIAL IS — the one question the step asks before any date.
 *
 * It exists because the five formats orgs actually post split cleanly into
 * three, and each needs a different row:
 *
 *   single       one day at one ground. The common case, and it must stay
 *                as light as the plain date field it replaced.
 *   multi_day    several days at the SAME ground: screening then final, or
 *                a day per district. One venue, set once on the trial.
 *                Whether a player attends all of them or picks one is a
 *                real question here, so the mode radios show.
 *   multi_place  several centres, each with its own ground: a city tour, or
 *                a North zone and a South zone on one Saturday. A player
 *                attends ONE of them, so there is no mode to ask about.
 *
 * The shape is not stored. It is a lens on the rows — `shapeFromSessions`
 * reads it back off them when an existing trial is opened for editing.
 */
export type TrialShape = "single" | "multi_day" | "multi_place"

export type SessionDraft = {
    /** Local React key. NEVER sent. */
    key: string
    /** The server's id, when this row came back from the API. Round-trips. */
    id?: string
    /** "YYYY-MM-DD". */
    date: string
    /** "HH:MM", or "" for a date with no time. */
    startTime: string
    endTime: string
    /** "Kochi round", "Day 2". Optional. */
    title: string
    /** Venue OVERRIDE. Blank inherits the trial's venue — never copy it in. */
    venueName: string
    venueLink: string
    /**
     * This centre's own geocoded place. multi_place only — the other two
     * shapes have one ground, set on the trial itself.
     *
     * Null means "no place of its own", which is what makes the row inherit
     * the trial's. It is NOT the same as the trial having no place: a row
     * with a place here is what puts this centre on the map for a player
     * searching the city it visits.
     */
    location: PlaceResult | null
    isCancelled: boolean
}

let sequence = 0

function nextKey(): string {
    sequence += 1
    return `session-${sequence}-${Math.random().toString(36).slice(2, 8)}`
}

export function newSessionDraft(date = ""): SessionDraft {
    return {
        key: nextKey(),
        date,
        startTime: "",
        endTime: "",
        title: "",
        venueName: "",
        venueLink: "",
        location: null,
        isCancelled: false,
    }
}

/** The state a fresh open trial starts in: exactly one empty date. */
export function initialSessionDrafts(): SessionDraft[] {
    return [newSessionDraft()]
}

/**
 * The time a trial starts when the org picked a DAY and said nothing else.
 *
 * Trials are morning things — nobody runs one at midnight, which is what an
 * empty time used to mean on screen. It is a default, not a rule: it is only
 * ever written on the empty-date → has-date transition (`withDefaultStart`),
 * so a time the org typed is never touched and one they cleared on purpose
 * stays cleared.
 */
export const DEFAULT_SESSION_START = "07:00"

/**
 * Append a row, with the label the shape already implies.
 *
 * Several days at one ground are "Day 1", "Day 2" nine times in ten, and
 * typing that is work the wizard can do. The first row is only labelled once
 * there is a SECOND one to tell it apart from — a lone date needs no name —
 * and a title the org wrote is never overwritten.
 *
 * The other two shapes get nothing: one day has no label field at all, and a
 * centre is named after the place that is picked for it (`titleForPlace`).
 */
export function addSessionDraft(
    drafts: SessionDraft[],
    shape: TrialShape,
): SessionDraft[] {
    if (shape !== "multi_day") return [...drafts, newSessionDraft()]

    const existing = drafts.length === 1 && !drafts[0].title.trim()
        ? [{ ...drafts[0], title: "Day 1" }]
        : drafts

    return [
        ...existing,
        { ...newSessionDraft(), title: `Day ${drafts.length + 1}` },
    ]
}

/**
 * The label a centre gives itself: the CITY it is in, falling back to the
 * place's own name.
 *
 * A city tour's rows are told apart by where they are, so the place that was
 * picked for a row already answers "which one is this?" — and the city is the
 * answer a player scanning the list is looking for, not the ground's name,
 * which the venue line below it already carries.
 */
export function titleForPlace(place: PlaceResult): string {
    return place.city.trim() || place.name.trim()
}

/**
 * A picked place as a Google Maps link, in Google's own documented Maps URLs
 * format — the coordinates are what resolve it, and `query_place_id` is what
 * pins it to THIS ground rather than whatever else sits on the point.
 *
 * A place with no id (one mapped back off an older stored Location, which
 * keeps no place id) sends the coordinates alone rather than an empty
 * parameter.
 */
export function mapsLinkFor(place: PlaceResult): string {
    const query = `${place.latitude},${place.longitude}`
    const base = `https://www.google.com/maps/search/?api=1&query=${query}`
    const placeId = place.external_id.trim()
    return placeId
        ? `${base}&query_place_id=${encodeURIComponent(placeId)}`
        : base
}

/** "HH:MM:SS" from the API → "HH:MM" for an <input type="time">. */
function toTimeInput(value: string | null): string {
    if (!value) return ""
    return value.slice(0, 5)
}

/**
 * A stored Location back into the type the pickers speak.
 *
 * Returns null without coordinates, the same rule `mapInitialLocation` uses
 * for the trial's own place: a PlaceResult's point is non-nullable because
 * one is only ever built from a details response that had it, and a stored
 * Location's point is a cache that can expire.
 *
 * `label` and `types` are not stored server-side. The label is rebuilt from
 * the parts for the pill to show, and `types` — Google's own, read only for
 * choosing an icon — comes back empty.
 */
function toPlace(location: TrialSessionLocation): PlaceResult | null {
    if (location.latitude == null || location.longitude == null) return null

    return {
        provider: "google",
        place_type: location.place_type,
        label: [location.name, location.state, location.country_code]
            .filter(Boolean)
            .join(", "),
        name: location.name,
        city: location.city,
        state: location.state,
        country: location.country,
        country_code: location.country_code,
        latitude: location.latitude,
        longitude: location.longitude,
        external_id: location.external_id,
        types: [],
    }
}

/**
 * API rows → draft rows, KEEPING each row's server id. An edit that loses
 * these ids deletes and recreates every date — see the module docstring.
 *
 * The venue reads the `own_*` keys, never the resolved ones: those have the
 * trial's venue already substituted in wherever the row set none, so copying
 * them here would turn every inherited venue into a per-date override on the
 * next save — and then changing the trial's venue would move nothing.
 */
export function sessionsFromApi(
    sessions: TrialSession[] | undefined,
): SessionDraft[] {
    if (!sessions || sessions.length === 0) return initialSessionDrafts()

    return sessions.map(session => ({
        key: nextKey(),
        id: session.id,
        date: session.date,
        startTime: toTimeInput(session.start_time),
        endTime: toTimeInput(session.end_time),
        title: session.title ?? "",
        venueName: session.own_venue_name ?? "",
        venueLink: session.own_venue_link ?? "",
        location: session.own_location ? toPlace(session.own_location) : null,
        isCancelled: session.is_cancelled,
    }))
}

/**
 * The shape an EXISTING trial already is, read off its rows.
 *
 * A per-row venue is the tell for multi_place: nothing else sets one, and a
 * row that has its own place or its own venue name is a centre rather than
 * another day at the trial's ground. Below that it is simply a question of
 * how many dates there are.
 */
export function shapeFromSessions(drafts: SessionDraft[]): TrialShape {
    const hasOwnVenue = drafts.some(
        draft => draft.location !== null || draft.venueName.trim() !== "",
    )
    if (hasOwnVenue) return "multi_place"
    if (liveSessions(drafts).length >= 2) return "multi_day"
    return "single"
}

/**
 * The mode a shape implies, which is the only mode the payload may send.
 *
 * Two of the three shapes answer the question by existing — one date cannot
 * be chosen between, and several CENTRES are always a choice of one — so the
 * radios are shown for multi_day alone and its value is the only one that
 * survives. Keeping the state and resolving it here (rather than forcing it
 * on every switch) means flipping through the cards never destroys the
 * attend-all / pick-one answer the org already gave.
 */
export function sessionModeForShape(
    shape: TrialShape,
    mode: SessionMode,
): SessionMode {
    if (shape === "single") return "all"
    if (shape === "multi_place") return "choose_one"
    return mode
}

/** Rows that still count: a real date, not cancelled. */
export function liveSessions(drafts: SessionDraft[]): SessionDraft[] {
    return drafts.filter(draft => draft.date && !draft.isCancelled)
}

/**
 * THE HANDLE A CATEGORY POINTS AT THIS DATE BY.
 *
 * An age category can be held at only some of a trial's dates, and it has to
 * name them in the SAME payload the dates are sent in. The server id is that
 * name once it exists; before then — a brand-new trial, where no row has
 * been written yet — the local React key is. So: the id when there is one,
 * the key when there is not.
 *
 * ONE FUNCTION, TWO READERS. `buildSessionsPayload` sends this as each row's
 * `ref` and `buildAgeCategoriesPayload` sends it inside `session_refs`; if
 * the two ever computed it differently every link would resolve to nothing
 * and the server would reject the save. Whatever the wizard STORES in
 * `AgeGroupDraft.sessionKeys` has to come from here too, never the bare key.
 */
export function sessionRef(draft: SessionDraft): string {
    return draft.id ?? draft.key
}

/**
 * What to call one date on a chip — the thing that tells it apart from the
 * others, which is a different field per shape.
 *
 * Several CENTRES are told apart by where they are (the city, the way
 * `titleForPlace` labels the row itself), several DAYS by which day they are.
 * Falls back through everything that could name a row before giving it its
 * position, so a chip is never blank.
 */
export function sessionLabel(
    draft: SessionDraft,
    shape: TrialShape,
    index: number,
): string {
    if (shape === "multi_place") {
        const place = draft.location
        const city = place?.city.trim() || ""
        if (city) return city
        const venue = draft.venueName.trim() || place?.name.trim() || ""
        if (venue) return venue
    }

    const title = draft.title.trim()
    if (title) return title
    if (draft.date) return formatSessionDay(draft)
    return `Date ${index + 1}`
}

/**
 * A wizard date value ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM") back into a row,
 * so the date+time control the single-date field already uses drives a row
 * unchanged. The row keeps its id, which is the only thing that matters.
 */
export function withDateValue(draft: SessionDraft, value: string): SessionDraft {
    if (!value) return { ...draft, date: "", startTime: "" }
    const [date, time = ""] = value.split("T")
    return { ...draft, date, startTime: time }
}

/**
 * The 7 AM default, applied to a row that just got its FIRST date.
 *
 * `before` is the row as it was, `after` the row the date control or a preset
 * chip just produced. The transition is the whole rule: a row that already had
 * a date is left alone, so clearing the time off a date sticks instead of
 * springing back on the next keystroke, and a time the org set is never
 * touched.
 */
export function withDefaultStart(
    before: SessionDraft,
    after: SessionDraft,
): SessionDraft {
    if (before.date || !after.date || after.startTime) return after
    return { ...after, startTime: DEFAULT_SESSION_START }
}

/** A row as a wizard date value, so wizardDate does all the parsing. */
export function sessionDateValue(draft: SessionDraft): string {
    if (!draft.date) return ""
    return draft.startTime ? `${draft.date}T${draft.startTime}` : draft.date
}

function sessionStart(draft: SessionDraft): number {
    const parsed = parseLocalInput(sessionDateValue(draft))
    return parsed ? parsed.getTime() : Number.POSITIVE_INFINITY
}

/** The date the trial STARTS on — the earliest live row, or null. */
export function firstSession(drafts: SessionDraft[]): SessionDraft | null {
    const live = liveSessions(drafts)
    if (live.length === 0) return null
    return live.reduce((earliest, draft) =>
        sessionStart(draft) < sessionStart(earliest) ? draft : earliest,
    )
}

/** "15 Jun 2030" — the date as the org wrote it. Module-private: its readers
 *  are `sessionLabel` and validateSessions' deadline message below. */
function formatSessionDay(draft: SessionDraft): string {
    const parsed = parseLocalInput(draft.date)
    if (!parsed) return draft.date
    return parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

/**
 * Draft rows → the payload. Rows with no date are dropped (an empty row the
 * org never filled in is not a date), and every other row keeps its id.
 */
export function buildSessionsPayload(
    drafts: SessionDraft[],
): CreateTrialSessionPayload[] {
    return drafts
        .filter(draft => draft.date)
        .map((draft, index) => {
            const payload: CreateTrialSessionPayload = {
                date: draft.date,
                display_order: index,
            }
            // The id is what makes this an EDIT of this row rather than a
            // delete-and-recreate. Never drop it.
            if (draft.id) payload.id = draft.id
            // The handle the categories name this date by — the id on an
            // edit, the local key on a trial whose rows do not exist yet.
            // Sent on EVERY row, because a category added later in the same
            // save must be able to point at any of them.
            payload.ref = sessionRef(draft)
            if (draft.title.trim()) payload.title = draft.title.trim()
            if (draft.startTime) payload.start_time = draft.startTime
            if (draft.endTime) payload.end_time = draft.endTime
            if (draft.venueName.trim()) payload.venue_name = draft.venueName.trim()
            if (draft.venueLink.trim()) payload.venue_link = draft.venueLink.trim()
            // This centre's own place, in the same shape the recruitment's
            // own location is sent in — provider + external_id included, so
            // the server finds the existing Location row by id instead of
            // minting a second copy of the same ground per date.
            if (draft.location) {
                payload.location = {
                    provider: draft.location.provider,
                    external_id: draft.location.external_id,
                    name: draft.location.name,
                    type: draft.location.place_type,
                    // `city` must never be undefined — the nested serializer
                    // reads a missing city as a validation error. The place
                    // name is the fallback for a ground outside any named
                    // locality.
                    city: draft.location.city || draft.location.name,
                    state: draft.location.state,
                    country: draft.location.country,
                    country_code: draft.location.country_code,
                    latitude: draft.location.latitude,
                    longitude: draft.location.longitude,
                }
            }
            if (draft.isCancelled) payload.is_cancelled = true
            return payload
        })
}

/**
 * Stands for "this row has no venue of its own". Prefixed with a NUL so no
 * venue anybody can type collides with it: every inheriting row shares this
 * key, which is what keeps two of them on one date and time a duplicate.
 */
const INHERITS_TRIAL_VENUE = " inherits"

/**
 * Where a row is held, as a comparable key. Mirrors `_session_venue_key` on
 * the server — the venue is part of a date's identity, so date + time alone
 * cannot say what a duplicate is.
 *
 * Strongest identity first: the picked place's id, its name where the place
 * carries no id (one mapped from an older record has none), then the venue
 * name typed by hand, then the shared "inherits" key. Normalized the same
 * way at both name tiers, so a place naming the ground and a venue name
 * typing it are the one place rather than two.
 */
function draftVenueKey(draft: SessionDraft): string {
    const place = draft.location
    if (place) {
        const externalId = place.external_id.trim()
        if (externalId) return externalId
        const name = place.name.trim().toLowerCase()
        if (name) return name
    }

    const venueName = draft.venueName.trim().toLowerCase()
    if (venueName) return venueName

    return INHERITS_TRIAL_VENUE
}

/**
 * The server's rules, checked here so the org sees them before submitting
 * rather than as a 400. Returns the first problem, or null.
 *
 * `deadline` is a wizard date value ("" when unset).
 */
export function validateSessions(
    drafts: SessionDraft[],
    deadline: string,
): string | null {
    const live = liveSessions(drafts)

    if (live.length === 0) {
        return "Add at least one trial date."
    }

    // Same date, same time AND same venue is a duplicate, not a second
    // round. Two grounds sharing one Saturday morning are two centres and
    // allowed — this is the server's rule, checked here so the org sees it
    // before submitting.
    const slots = new Set<string>()
    for (const draft of live) {
        const slot = `${draft.date}|${draft.startTime}|${draftVenueKey(draft)}`
        if (slots.has(slot)) {
            return (
                "Two trial dates are the same date, time and venue. " +
                "Remove the duplicate."
            )
        }
        slots.add(slot)
    }

    // The deadline cannot be after the trial starts. event_date is derived
    // from the first date, and the server has a CheckConstraint behind this.
    const opening = firstSession(drafts)
    const deadlineAt = parseLocalInput(deadline)
    if (opening && deadlineAt) {
        const startsAt = parseLocalInput(sessionDateValue(opening))
        if (startsAt && deadlineAt.getTime() > startsAt.getTime()) {
            return (
                "The application deadline is after the first trial date. " +
                `Move the deadline to on or before ${formatSessionDay(opening)}.`
            )
        }
    }

    return null
}
