/**
 * Can somebody still apply to this?
 *
 * ONE definition, because three surfaces answer it and they must not drift:
 * the card's status pill ("Live" / "Closing soon" vs "Closed"), its action
 * label (Apply vs View), and the Recommended page, which lists nothing else.
 *
 * These are the same three conditions the backend's listing bucket 1 uses —
 * active, trial window open, deadline not passed — so the pill, the button
 * and the server's own ordering can never disagree about one row.
 *
 * Note what the SERVER already guarantees for a player-facing list, and what
 * it does not (`build_list_queryset`, non-owner branch): drafts, closed and
 * cancelled postings are filtered out, and so is any trial whose day has
 * ended. A row whose APPLICATION DEADLINE has passed is deliberately kept —
 * the "All" tab wants it, wearing its "Applications closed" badge. So this
 * is not a re-implementation of the server's filter; it is the one extra
 * question the server intentionally leaves open.
 */

import { daysToDeadline } from "./matchContext"
import { isTrialOver, type TrialTiming } from "./trialEnded"

/** The fields this reads — every list and detail payload carries them. */
export type ApplicationWindow = TrialTiming & {
    status?: string
    application_deadline?: string | null
    match?: { days_to_deadline?: number | null } | null
}

/**
 * Days until applications close: from the deadline itself whenever there is
 * one, and only otherwise from the server's count. `days_to_deadline` is
 * computed at request time, so a page cached across the deadline would keep
 * counting past it. Null means "no deadline", which is not the same as zero.
 */
export function daysToApply(
    recruitment: ApplicationWindow | null | undefined
): number | null {
    if (!recruitment) return null
    return (
        daysToDeadline(recruitment.application_deadline) ??
        recruitment.match?.days_to_deadline ??
        null
    )
}

export function isAcceptingApplications(
    recruitment: ApplicationWindow | null | undefined,
    now: Date | number = Date.now()
): boolean {
    if (!recruitment) return false
    if (recruitment.status !== "active") return false
    if (isTrialOver(recruitment, now)) return false
    const days = daysToApply(recruitment)
    return days === null || days >= 0
}
