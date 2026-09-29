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

import type {
    CreateTrialSessionPayload,
    SessionMode,
    TrialSession,
} from "../../services/recruitments.api"
import { parseLocalInput } from "./wizardDate"

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
        isCancelled: false,
    }
}

/** The state a fresh open trial starts in: exactly one empty date. */
export function initialSessionDrafts(): SessionDraft[] {
    return [newSessionDraft()]
}

/** "HH:MM:SS" from the API → "HH:MM" for an <input type="time">. */
function toTimeInput(value: string | null): string {
    if (!value) return ""
    return value.slice(0, 5)
}

/**
 * API rows → draft rows, KEEPING each row's server id. An edit that loses
 * these ids deletes and recreates every date — see the module docstring.
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
        // The API resolves a blank venue against the recruitment's before it
        // sends it, so we cannot tell "its own venue" from "inherited" here.
        // Editing a per-date venue override is not in this stage; the row
        // keeps its inherited default and the trial venue stays the one
        // place it is set.
        venueName: "",
        venueLink: "",
        isCancelled: session.is_cancelled,
    }))
}

/** Rows that still count: a real date, not cancelled. */
export function liveSessions(drafts: SessionDraft[]): SessionDraft[] {
    return drafts.filter(draft => draft.date && !draft.isCancelled)
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

/** "15 Jun 2030" — the date as the org wrote it. Module-private: its only
 *  reader is validateSessions' deadline message below. */
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
 * The mode the payload should carry. `choose_one` only means anything with
 * two or more live dates; below that the server forces "all", so send it.
 */
export function effectiveSessionMode(
    drafts: SessionDraft[],
    mode: SessionMode,
): SessionMode {
    return liveSessions(drafts).length >= 2 ? mode : "all"
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
            if (draft.title.trim()) payload.title = draft.title.trim()
            if (draft.startTime) payload.start_time = draft.startTime
            if (draft.endTime) payload.end_time = draft.endTime
            if (draft.venueName.trim()) payload.venue_name = draft.venueName.trim()
            if (draft.venueLink.trim()) payload.venue_link = draft.venueLink.trim()
            if (draft.isCancelled) payload.is_cancelled = true
            return payload
        })
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

    // Two rows on the same date AND at the same time are a duplicate, not a
    // second round. A second time on the same day is fine.
    const slots = new Set<string>()
    for (const draft of live) {
        const slot = `${draft.date}|${draft.startTime}`
        if (slots.has(slot)) {
            return "Two trial dates are the same. Remove the duplicate."
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
