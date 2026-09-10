import { z } from "zod"

/**
 * Date-of-birth validation, shared by every form that asks for one.
 *
 * The value on the wire — and in form state — is always an ISO "YYYY-MM-DD"
 * string, never a Date. Date carries a time and a timezone, and a birthday is
 * neither: `new Date("2010-03-14")` is midnight UTC, which is 13 March for
 * anyone west of Greenwich, and that is a whole day of age error for free.
 */

/** Oldest year anyone may claim. Mirrors the backend's typo filter, not a policy. */
export const EARLIEST_BIRTH_YEAR = 1900

/**
 * True only for a date that exists on the calendar.
 *
 * The round-trip is the check: JavaScript's Date silently rolls 31 February
 * over into 3 March, so the only reliable way to reject an impossible date is
 * to build one and see whether it still describes the numbers it was given.
 */
export function isRealCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

/** Parse "YYYY-MM-DD" into its three numbers, or null if it isn't one. */
export function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  return isRealCalendarDate(year, month, day) ? { year, month, day } : null
}

/** Compose "YYYY-MM-DD" from parts, or "" when they don't form a real date. */
export function toIsoDate(year: number, month: number, day: number): string {
  if (!isRealCalendarDate(year, month, day)) return ""

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`
}

/**
 * Whole years old today, or null if the input isn't a usable date.
 *
 * The month/day comparison is the part that matters: somebody whose birthday
 * falls later this year has not had it yet. Without it, every user is a year
 * older than they are for most of the year.
 */
export function ageFromIsoDate(value: string): number | null {
  const parts = parseIsoDate(value)
  if (!parts) return null

  const today = new Date()
  let age = today.getFullYear() - parts.year

  const hasHadBirthday =
    today.getMonth() + 1 > parts.month ||
    (today.getMonth() + 1 === parts.month && today.getDate() >= parts.day)

  if (!hasHadBirthday) age -= 1

  return age
}

/**
 * The oldest age the input echoes back on screen.
 *
 * DISPLAY ONLY. Nothing refuses a birthday above it — the schema below has no
 * age rule at all and the backend is the only thing that decides who may sign
 * up. This number governs one line of text and nothing else.
 */
export const MAX_ECHOED_AGE = 25

/**
 * The age to show under the boxes, or null for "show nothing".
 *
 * Two jobs, and the first is the reason this exists rather than the component
 * calling ageFromIsoDate directly. A year is typed one digit at a time, so
 * every partial year passes through here on its way to the real one — and
 * `201` is a date the calendar accepts (year 201 AD), which composed to
 * "0201-11-21" and echoed back "You're 1824" at somebody halfway through
 * typing 2010. Anything that is not a plausible age for a person now yields
 * null, so the line simply is not there yet.
 *
 * The second job is the ceiling. Above MAX_ECHOED_AGE the line disappears
 * rather than reading "You're 127", and its absence is itself the signal that
 * the year needs another look.
 */
export function ageToEcho(value: string): number | null {
  const age = ageFromIsoDate(value)

  // A negative age is a birthday later this year — a half-typed year again,
  // not somebody unborn.
  if (age === null || age < 0 || age >= MAX_ECHOED_AGE) return null

  return age
}

/**
 * The field schema.
 *
 * Deliberately does NOT enforce a minimum age. The backend refuses under-13
 * signups with a neutral message that never names the limit, and a client-side
 * rule would undo that in one line: a form that says "you must be 13 or older"
 * has told the user exactly which year to retype. Everything checked here is
 * something the user can see is wrong for themselves — a missing field, an
 * impossible date, a date in the future.
 */
export const dateOfBirthSchema = z
  .string()
  .min(1, "Please enter your date of birth")
  .refine((value) => parseIsoDate(value) !== null, {
    message: "That date doesn't exist — check the day and month",
  })
  .refine(
    (value) => {
      const parts = parseIsoDate(value)
      return parts === null || parts.year >= EARLIEST_BIRTH_YEAR
    },
    { message: "Check the year" },
  )
  .refine(
    (value) => {
      const parts = parseIsoDate(value)
      if (parts === null) return true

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      return new Date(parts.year, parts.month - 1, parts.day) <= today
    },
    { message: "Date of birth can't be in the future" },
  )
