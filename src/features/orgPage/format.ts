import { orgTypeLabel } from "@/features/organization/orgTypeLabel"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import {
  WEEK_DAYS,
  type FeePer,
  type ProgramFee,
  type ProgramLevel,
  type WeekDay,
} from "./types"

/**
 * Words and numbers for the page's screens. Phase 3 (what visitors see) reuses
 * formatPhone, so it stays free of anything editor-only.
 */

/** "1 program", "3 programs". */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Two letters for an avatar with no photo: "Meera Nair" → "MN", "Rahul" → "RA". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2)
  return letters.toUpperCase() || "?"
}

/** "1 yr", "12 yrs"; "" for none. */
export function yearsLabel(years: number | null | undefined): string {
  if (!years) return ""
  return `${years} ${years === 1 ? "yr" : "yrs"}`
}

/**
 * A stored number for reading. An Indian mobile ("+91" and 10 digits) reads
 * "+91 98765 43210"; any other number reads as stored. Never used for what is
 * sent: the person's own typing goes to the server, which normalizes it.
 */
export function formatPhone(value: string | null | undefined): string {
  const phone = (value ?? "").trim()
  const indian = /^\+91(\d{5})(\d{5})$/.exec(phone)
  return indian ? `+91 ${indian[1]} ${indian[2]}` : phone
}

/**
 * What the page is, in a sentence: "your academy", "your club", "your team".
 * A type this build does not know reads "organization", never the raw value.
 */
export function orgNoun(type: string | null | undefined): string {
  return orgTypeLabel(type).toLowerCase() || "organization"
}

// ── The page's link ───────────────────────────────────────────

/** The short link a club shares: goatza.com/<username>, which lands on its page. */
export function pageShareUrl(username: string): string {
  return `${siteOrigin()}/${username}`
}

/** The same link as people read it, without the scheme: "goatza.com/kannurfa". */
export function pageShareText(username: string): string {
  let host = siteOrigin()
  try {
    host = new URL(siteOrigin()).host
  } catch {
    host = host.replace(/^https?:\/\//, "")
  }
  return `${host.replace(/^www\./, "")}/${username}`
}

/** The public page, which "Preview" opens. */
export function publicPagePath(username: string): string {
  return `/organization/profile/${username}`
}

// ── Programs: fee, ages, days, time ───────────────────────────

/** Short and long names for each day, in week order. */
export const WEEK_DAY_LABELS: Record<WeekDay, { short: string; long: string }> = {
  mon: { short: "Mon", long: "Monday" },
  tue: { short: "Tue", long: "Tuesday" },
  wed: { short: "Wed", long: "Wednesday" },
  thu: { short: "Thu", long: "Thursday" },
  fri: { short: "Fri", long: "Friday" },
  sat: { short: "Sat", long: "Saturday" },
  sun: { short: "Sun", long: "Sunday" },
}

export { WEEK_DAYS }

const RUPEES = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

const FEE_PER_WORDS: Record<FeePer, string> = {
  month: "month",
  term: "term",
  year: "year",
  session: "session",
}

/** "₹1,500 / month", or "Contact for fees". */
export function formatFee(fee: Pick<ProgramFee, "mode" | "amount" | "per">): string {
  if (fee.mode !== "amount" || fee.amount === null || fee.amount === undefined) {
    return "Contact for fees"
  }
  const amount = `₹${RUPEES.format(fee.amount)}`
  return fee.per ? `${amount} / ${FEE_PER_WORDS[fee.per]}` : amount
}

/** "Ages 8 – 12"; "Age 8" when both ends are the same; one end alone reads open. */
export function formatAges(min: number | null | undefined, max: number | null | undefined): string {
  const hasMin = min !== null && min !== undefined
  const hasMax = max !== null && max !== undefined
  if (hasMin && hasMax) return min === max ? `Age ${min}` : `Ages ${min} – ${max}`
  if (hasMin) return `Ages ${min}+`
  if (hasMax) return `Up to age ${max}`
  return ""
}

/**
 * "Tue · Thu · Sat". All seven read "Every day", Mon–Fri "Mon – Fri", Sat and Sun
 * alone "Weekends", and any run of three or more days in a row "Mon – Wed".
 */
export function formatDays(days: readonly WeekDay[]): string {
  const chosen = WEEK_DAYS.filter((day) => days.includes(day))
  if (chosen.length === 0) return ""
  if (chosen.length === 7) return "Every day"
  const key = chosen.join(",")
  if (key === "mon,tue,wed,thu,fri") return "Mon – Fri"
  if (key === "sat,sun") return "Weekends"

  const runs: WeekDay[][] = []
  for (const day of chosen) {
    const run = runs[runs.length - 1]
    const previous = run?.[run.length - 1]
    if (run && previous && WEEK_DAYS.indexOf(day) === WEEK_DAYS.indexOf(previous) + 1) run.push(day)
    else runs.push([day])
  }
  return runs
    .flatMap((run) =>
      run.length >= 3
        ? [`${WEEK_DAY_LABELS[run[0]].short} – ${WEEK_DAY_LABELS[run[run.length - 1]].short}`]
        : run.map((day) => WEEK_DAY_LABELS[day].short)
    )
    .join(" · ")
}

function clock(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

function twelveHour({ hour, minute }: { hour: number; minute: number }): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:${String(minute).padStart(2, "0")}`
}

/** "4:30 – 6:00 PM"; across noon, "11:00 AM – 1:00 PM". */
export function formatTimeRange(start: string, end: string): string {
  const from = clock(start)
  const to = clock(end)
  if (!from || !to) return ""
  const fromPeriod = from.hour < 12 ? "AM" : "PM"
  const toPeriod = to.hour < 12 ? "AM" : "PM"
  return fromPeriod === toPeriod
    ? `${twelveHour(from)} – ${twelveHour(to)} ${toPeriod}`
    : `${twelveHour(from)} ${fromPeriod} – ${twelveHour(to)} ${toPeriod}`
}

/** "Main Ground, Thrissur"; either part alone; the city once when they match. */
export function formatBranch(location: { name?: string; city?: string } | null | undefined): string {
  if (!location) return ""
  const name = (location.name ?? "").trim()
  const city = (location.city ?? "").trim()
  if (name && city && name.toLowerCase() !== city.toLowerCase()) return `${name}, ${city}`
  return name || city
}

/** The server's words for a level, for anything drawn before the server answers. */
export const PROGRAM_LEVEL_LABELS: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all_levels: "All levels",
}

/** "per month" and so on, for the fee period Select. */
export const FEE_PER_LABELS: Record<FeePer, string> = {
  month: "per month",
  term: "per term",
  year: "per year",
  session: "per session",
}
