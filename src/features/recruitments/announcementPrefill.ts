/**
 * Turning "what just changed" into an announcement the org can send.
 *
 * WHY THIS EXISTS. Editing a recruitment notifies NOBODY — by design, because
 * a posting is a document and a silent typo fix should stay silent. But a
 * moved date is not a typo, and the org that moved it has already done the
 * hard part. So after an edit the client reads `schedule_changed_fields` off
 * the response and, when it is non-empty, opens the composer PRE-WRITTEN.
 *
 * The org can edit every word or skip entirely, and skipping is one tap. This
 * is a nudge, not a workflow step.
 *
 * The server reports WHICH KINDS of thing changed, not their before-and-after
 * values; the before-state is the wizard's, so the sentence is assembled here
 * where both halves exist.
 */

import type { AnnouncementAudience } from "./services/announcements.api"
import type { RecruitmentDetail, TrialSession } from "./services/recruitments.api"
import { formatSessionDate } from "./sessionDisplay"

/** The field names the update endpoint can return. */
export type ScheduleChange =
    | "session_date"
    | "session_added"
    | "session_removed"
    | "session_cancelled"
    | "session_restored"
    | "session_venue"
    | "venue"

function liveDates(sessions: TrialSession[] | undefined): TrialSession[] {
    return (sessions ?? []).filter((session) => !session.is_cancelled)
}

function dateList(sessions: TrialSession[]): string {
    return sessions.map((session) => formatSessionDate(session.date)).join(", ")
}

/**
 * The pre-filled announcement for a schedule change, or null when there is
 * nothing worth saying.
 *
 * `before` is the recruitment as the wizard loaded it; `after` is the same
 * recruitment re-read once the save landed. Where exactly one date moved, the
 * body names both ends of the move — "moved from Sun 19 Oct to Mon 20 Oct" is
 * the sentence a player can act on, and "the schedule changed" is not.
 */
export function buildReschedulePrefill(
    changes: string[],
    before: RecruitmentDetail,
    after: RecruitmentDetail,
): { title: string; body: string; audience: AnnouncementAudience } | null {
    if (changes.length === 0) return null

    const set = new Set(changes)
    const oldDates = liveDates(before.sessions)
    const newDates = liveDates(after.sessions)

    const lines: string[] = []

    if (set.has("session_date")) {
        // The clean, common case: one date, and it moved. Name both ends.
        if (oldDates.length === 1 && newDates.length === 1) {
            lines.push(
                `The trial has moved from ${formatSessionDate(oldDates[0].date)} ` +
                    `to ${formatSessionDate(newDates[0].date)}.`,
            )
        } else if (newDates.length > 0) {
            lines.push(`The trial dates are now ${dateList(newDates)}.`)
        } else {
            lines.push("The trial dates have changed.")
        }
    }

    if (set.has("session_cancelled")) {
        lines.push("One of the dates has been cancelled.")
    }

    if (set.has("session_added") && !set.has("session_date")) {
        lines.push(`A date has been added: ${dateList(newDates)}.`)
    }

    if (set.has("session_removed") && !set.has("session_cancelled")) {
        lines.push("One of the dates has been removed.")
    }

    if (set.has("venue") || set.has("session_venue")) {
        const venue = after.venue_name?.trim() || after.city?.trim()
        lines.push(
            venue
                ? `The venue is now ${venue}.`
                : "The venue has changed — check the posting for details.",
        )
    }

    if (lines.length === 0) return null

    // Say what did NOT change too. An org that moves a date and says nothing
    // about the time leaves every player wondering, and a reassurance costs
    // one sentence.
    if (set.has("session_date") && !set.has("venue") && !set.has("session_venue")) {
        lines.push("The venue and reporting time are unchanged.")
    }

    return {
        title: "Trial update",
        body: lines.join(" "),
        // With auto-confirm off, "confirmed" may be nobody yet — the people
        // who need to know are everyone who applied.
        audience: after.auto_confirm ? "confirmed" : "all_applicants",
    }
}
