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
  /**
   * The FIRST trial date. Results open on it, and on an "attend every date"
   * trial applications close on it. It is NOT when the trial ends.
   */
  event_date?: string | null
  /**
   * The LAST trial date, end of day. This is when the trial is over. Missing
   * on payloads cached before sessions shipped.
   */
  trial_end_date?: string | null
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

/**
 * QUESTION: have results opened yet?
 * READS: event_date, and ONLY event_date.
 *
 * Is the trial DAY still ahead — after today on the Kolkata calendar? Results
 * open ON the FIRST trial day, whatever its time, which is the same
 * calendar-day rule the server's results guard applies. No date → never
 * ahead.
 *
 * Do NOT "helpfully" switch this to trial_end_date. event_date is the first
 * session and results open on the first day; reading the last one would hold
 * results back for the whole of a three-weekend trial. Its twin,
 * isTrialOver, is the function that reads the last date.
 */
export function isTrialDayAhead(
  eventDate: string | null | undefined,
  now: Date | number = Date.now()
): boolean {
  if (!eventDate) return false
  const day = kolkataDay(eventDate)
  const today = kolkataDay(now)
  if (!day || !today) return false
  return day > today
}

/** "Sun 12 Oct" — the trial day as the venue reads it, like the server's copy. */
export function formatTrialDay(eventDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TRIAL_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(eventDate))
}

/**
 * QUESTION: has the WHOLE trial window closed?
 * READS: the server's flag, then trial_end_date, then event_date.
 *
 * A trial runs on one or more dates. It is over once the LAST of them has
 * ended in IST — a three-weekend trial is not over after weekend one. The
 * event_date fallback is for payloads cached before sessions shipped, where
 * the only date there was WAS the last one.
 *
 * Its twin, isTrialDayAhead, answers a different question off a different
 * date. Keep them apart.
 */
export function isTrialOver(
  recruitment: TrialTiming | null | undefined,
  now: Date | number = Date.now()
): boolean {
  if (!recruitment) return false
  if (typeof recruitment.is_trial_over === "boolean") return recruitment.is_trial_over

  const lastDay = recruitment.trial_end_date ?? recruitment.event_date
  if (!lastDay) return false
  const day = kolkataDay(lastDay)
  const today = kolkataDay(now)
  if (!day || !today) return false
  return day < today
}
