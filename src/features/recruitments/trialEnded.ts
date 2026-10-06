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
 * "Ended" means the trial's CALENDAR DAY is over AT THE VENUE — in the
 * recruitment's own `timezone`, which is the same rule and the same zone the
 * server applies. So a scout in London and the club in Kochi agree on the day
 * a Kochi trial ended, and they agree on a different day for a London one. A
 * trial at 6pm today is not over at 9pm today; it is over at midnight there.
 *
 * THE VIEWER'S ZONE IS NEVER THE ANSWER. Reading a London trial on an Indian
 * clock names the wrong calendar day at the ground, which is the one thing a
 * player standing outside it cannot afford.
 */

/**
 * Only for a payload that PREDATES the timezone field — an older cached list
 * or application row. The server sets the column on every recruitment now, so
 * this is a safety net and not a default to rely on: anything that has the
 * recruitment in hand passes its real zone.
 */
export const FALLBACK_TRIAL_TIME_ZONE = "Asia/Kolkata"

export type TrialTiming = {
  /** The server's verdict. Missing on payloads cached before it shipped. */
  is_trial_over?: boolean | null
  /**
   * The VENUE's zone, which is what the dates below are read in. It travels
   * WITH the dates rather than as a separate argument on purpose: every
   * caller already holds the whole recruitment, and a zone that has to be
   * remembered separately is a zone somebody forgets — silently getting IST,
   * which is the bug this field exists to fix. Optional for the same reason
   * as the fields around it: an older cached payload predates it.
   */
  timezone?: string
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
 * `YYYY-MM-DD` of `at` on the VENUE's calendar, or null when the input is not
 * a date. `en-CA` is the locale whose numeric format IS the ISO date, which
 * makes two days comparable as strings.
 *
 * Both sides of any comparison must be formatted in the SAME zone — pass one
 * recruitment's zone to both calls, never one zone for the trial day and
 * another for today.
 */
export function trialDay(
  at: Date | number | string,
  timeZone: string = FALLBACK_TRIAL_TIME_ZONE,
): string | null {
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * QUESTION: have results opened yet?
 * READS: event_date, and ONLY event_date.
 *
 * Is the trial DAY still ahead — after today on the VENUE's calendar? Results
 * open ON the FIRST trial day, whatever its time, which is the same
 * calendar-day rule the server's results guard applies. No date → never
 * ahead.
 *
 * `timeZone` is the recruitment's own. It takes one rather than reading a
 * recruitment because it is handed a bare date string, not the row.
 *
 * Do NOT "helpfully" switch this to trial_end_date. event_date is the first
 * session and results open on the first day; reading the last one would hold
 * results back for the whole of a three-weekend trial. Its twin,
 * isTrialOver, is the function that reads the last date.
 */
export function isTrialDayAhead(
  eventDate: string | null | undefined,
  now: Date | number = Date.now(),
  timeZone: string = FALLBACK_TRIAL_TIME_ZONE,
): boolean {
  if (!eventDate) return false
  const day = trialDay(eventDate, timeZone)
  const today = trialDay(now, timeZone)
  if (!day || !today) return false
  return day > today
}

/** "Sun 12 Oct" — the trial day as THE VENUE reads it, like the server's copy. */
export function formatTrialDay(
  eventDate: string,
  timeZone: string = FALLBACK_TRIAL_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
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
 * ended AT THE VENUE — a three-weekend trial is not over after weekend one.
 * The event_date fallback is for payloads cached before sessions shipped,
 * where the only date there was WAS the last one.
 *
 * The zone comes off the recruitment itself (`timezone`), so no caller has to
 * pass it and none can pass the wrong one — see that field on TrialTiming.
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
  const timeZone = recruitment.timezone || FALLBACK_TRIAL_TIME_ZONE
  const day = trialDay(lastDay, timeZone)
  const today = trialDay(now, timeZone)
  if (!day || !today) return false
  return day < today
}
