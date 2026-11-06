/**
 * The words around a date of birth, in one place: it is set at signup and
 * onboarding and then locked, and every screen that asks has to say so the same
 * way. What it decides is deliberately not mentioned (see the note in AuthCard):
 * telling somebody what the date is for tells them what to lie about.
 */

export const BIRTHDATE_SIGNUP_WARNING =
  "Check this carefully — you won't be able to change your date of birth later."

export const BIRTHDATE_LAST_CHANCE =
  "Last chance to change your date of birth. After this step it's locked."

export const BIRTHDATE_CONFIRM_TITLE = "Confirm your date of birth"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * "2008-03-12" → "12 March 2008", or "12 Mar 2008" with `short`.
 *
 * Read off the string rather than through a Date: a calendar date has no time
 * zone, and `new Date("2008-03-12")` is midnight UTC, which is the 11th for
 * anyone west of Greenwich.
 */
export function formatBirthdate(iso: string, month: "long" | "short" = "long"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined

  if (!match || !name) return iso

  return `${Number(match[3])} ${month === "short" ? name.slice(0, 3) : name} ${match[1]}`
}

export function birthdateConfirmMessage(iso: string): string {
  return `Is ${formatBirthdate(iso)} your correct date of birth? You won't be able to change it later.`
}

/** The sentence the server refused a date with, from a 400 on `birthdate`. */
export function birthdateFieldError(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { data?: { birthdate?: unknown } } } })?.response
    ?.data?.data
  const message = data?.birthdate

  if (Array.isArray(message)) return typeof message[0] === "string" ? message[0] : undefined

  return typeof message === "string" ? message : undefined
}
