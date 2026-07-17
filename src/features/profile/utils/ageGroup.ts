/**
 * Age + age-group helpers derived from a "YYYY-MM-DD" birthdate.
 *
 * The age-group badge mirrors the backend rule:
 *   age <= 7        → "U7"
 *   age <= 23       → "U{age}"   (U8 … U23)
 *   otherwise       → "Senior"
 */

/** Full years old today, or null if birthdate is missing/unparseable/future. */
export function calcAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null

  const dob = new Date(birthdate)
  if (Number.isNaN(dob.getTime())) return null

  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1
  }

  return age < 0 ? null : age
}

/** Age-group label (e.g. "U17", "Senior") or null when age can't be computed. */
export function ageGroupBadge(birthdate: string | null | undefined): string | null {
  const age = calcAge(birthdate)
  if (age === null) return null
  if (age <= 7) return "U7"
  if (age <= 23) return `U${age}`
  return "Senior"
}
