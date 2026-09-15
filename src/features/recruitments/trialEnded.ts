/**
 * Has the trial day come and gone?
 *
 * The server says so with `is_trial_over` on every list and detail payload,
 * and hides ended trials from the player-facing lists outright. The org still
 * sees everything, a shortlist keeps what was saved, and an application keeps
 * its recruitment — so those surfaces mark an ended trial rather than
 * dropping it. This is the one place the answer is worked out, and it works
 * without the field too: an older cached payload predates it.
 *
 * "Ended" means the trial's CALENDAR DAY is over in Asia/Kolkata — the same
 * rule the server applies, in the venue's time zone rather than the viewer's,
 * so a scout in London and the club in Kochi agree on the day it ended. A
 * trial at 6pm today is not over at 9pm today; it is over at midnight IST.
 */

/** The venue's calendar. Every trial on the product is on this clock. */
export const TRIAL_TIME_ZONE = "Asia/Kolkata"

export type TrialTiming = {
  /** The server's verdict. Missing on payloads cached before it shipped. */
  is_trial_over?: boolean | null
  /** The trial day. Null on a posting with no date, which never "ends". */
  event_date?: string | null
}

/**
 * `YYYY-MM-DD` of `at` on the Kolkata calendar, or null when the input is not
 * a date. `en-CA` is the locale whose numeric format IS the ISO date, which
 * makes the two days comparable as strings.
 */
export function kolkataDay(at: Date | number | string): string | null {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TRIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function isTrialOver(
  recruitment: TrialTiming | null | undefined,
  now: Date | number = Date.now()
): boolean {
  if (!recruitment) return false
  if (typeof recruitment.is_trial_over === "boolean") return recruitment.is_trial_over

  if (!recruitment.event_date) return false
  const day = kolkataDay(recruitment.event_date)
  const today = kolkataDay(now)
  if (!day || !today) return false
  return day < today
}
