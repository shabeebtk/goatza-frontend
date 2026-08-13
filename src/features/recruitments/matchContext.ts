/**
 * Match context → the words on a card (§5).
 *
 * The rule this file exists to enforce: **the score is never displayed**. A
 * number invites an argument the player cannot win ("why is this 71?"); a
 * reason — "Your sport · Striker · 8 km · Closes in 5 days" — is checkable and
 * builds trust in the ranking. `match_score` reaches the client for debugging
 * and nothing else, and nothing here reads it.
 *
 * The eligibility badge is informational, never prohibitive. It says what the
 * posting is open to, not what the viewer may do: Goatza displays eligibility,
 * the venue verifies it, and the Apply button is not this file's business.
 */

import dayjs from "dayjs"

import type { Recruitment, RecruitmentMatchContext } from "./services/recruitments.api"

export type MatchChip = {
  /** Stable across renders — used as the React key. */
  key: string
  label: string
  icon: string
}

/** Rounded the way a person would say it: "8 km", "24 km", "<1 km". */
export function formatDistance(km: number): string {
  if (km < 1) return "<1 km"
  return `${Math.round(km)} km`
}

/** "Closes today" / "Closes tomorrow" / "Closes in 5 days". */
export function formatDeadline(days: number): string | null {
  // Already past. The "Applications closed" badge says it better, and saying
  // it twice on one card reads as shouting.
  if (days < 0) return null
  if (days === 0) return "Closes today"
  if (days === 1) return "Closes tomorrow"
  return `Closes in ${days} days`
}

/** How loudly a deadline should read. Maps to a colour AND to words. */
export type UrgencyTone = "none" | "calm" | "soon" | "today" | "closed"

/**
 * Whole days until a deadline INSTANT — not until its calendar date.
 *
 * A deadline is a moment, so 13 Aug 10:00 is over by 13 Aug 13:00. Both
 * dayjs's `diff(…, "day")` (truncates toward zero) and a naive `ceil` report
 * 0 for that, which renders as "Closes today" on a posting whose own detail
 * page says "Applications closed". Anything already past is at least -1.
 *
 * Mirrors the backend's MatchScoreService._days_to_deadline exactly, so a
 * ranked card and an org-profile card never disagree about the same row.
 */
export function daysToDeadline(
  deadline: string | null | undefined,
  now: dayjs.Dayjs = dayjs(),
): number | null {
  if (!deadline) return null

  const end = dayjs(deadline)
  if (!end.isValid()) return null

  const seconds = end.diff(now, "second")
  if (seconds <= 0) return Math.min(-1, Math.floor(seconds / 86400))
  return Math.ceil(seconds / 86400)
}

/**
 * The card's deadline slot. Deliberately NOT a change to `formatDeadline`,
 * which returns null once a deadline has passed — correct for a chip in a row
 * of other chips, wrong for a fixed cell that would otherwise sit empty. The
 * card has room to say "Applications closed" outright, so it does.
 *
 * Red is reserved for the last day. A week out is amber: if everything urgent
 * is red, nothing red is urgent. The tone only ever tints text that already
 * says the same thing, so colour is never the sole carrier of meaning.
 */
export function formatUrgency(
  days: number | null,
): { label: string; tone: UrgencyTone } | null {
  if (days === null) return null
  if (days < 0) return { label: "Applications closed", tone: "closed" }
  if (days === 0) return { label: "Closes today", tone: "today" }
  if (days === 1) return { label: "Closes tomorrow", tone: "soon" }
  if (days <= 7) return { label: `Closes in ${days} days`, tone: "soon" }
  return { label: `Closes in ${days} days`, tone: "calm" }
}

/**
 * The chip row, left to right, in the order §5 lists them. Anything the server
 * could not determine is simply absent — an unknown is never rendered as a
 * zero, a dash, or a "not specified".
 *
 * No longer read by RecruitmentCard, which moved to a labelled spec grid — but
 * it stays exported as part of this module's public surface.
 */
export function buildMatchChips(recruitment: Recruitment): MatchChip[] {
  const match = recruitment.match
  if (!match) return []

  const chips: MatchChip[] = []

  if (match.sport_match === "primary") {
    chips.push({ key: "sport", label: "Your sport", icon: "mdi:star-circle-outline" })
  } else if (match.sport_match === "other") {
    // Named rather than "You also play this": the sport is the useful word.
    chips.push({
      key: "sport",
      label: recruitment.sport.name,
      icon: "mdi:star-circle-outline",
    })
  }

  if (match.position_match && match.matched_positions.length > 0) {
    chips.push({
      key: "position",
      label: match.matched_positions.slice(0, 2).join(" / "),
      icon: "mdi:account-star-outline",
    })
  }

  if (match.distance_km !== null) {
    chips.push({
      key: "distance",
      label: formatDistance(match.distance_km),
      icon: "mdi:map-marker-distance",
    })
  }

  if (match.days_to_deadline !== null) {
    const label = formatDeadline(match.days_to_deadline)
    if (label) {
      chips.push({ key: "deadline", label, icon: "mdi:timer-sand" })
    }
  }

  return chips
}

// ── Profile completion (§5) ───────────────────────────────────

/**
 * The prompt names the fields that are actually missing rather than nudging
 * generically, because every one of them genuinely weakens the score — so a
 * specific prompt is an honest one, and a generic one is a guess.
 *
 * `anchor` is the profile section that owns the field. Every editor on the
 * profile is a modal opened from its own section, so there is no per-field URL
 * to link to; the hash scrolls to the right section and the copy names the
 * field. Give the sections matching ids if that ever needs to be exact.
 */
export const MISSING_FIELD_META: Record<
  string,
  { label: string; why: string; anchor: string }
> = {
  sport: {
    label: "your sport",
    why: "the single biggest signal in the ranking",
    anchor: "sports",
  },
  positions: {
    label: "your positions",
    why: "so we match the roles a trial is actually looking for",
    anchor: "sports",
  },
  birthdate: {
    label: "your date of birth",
    why: "so age-group trials sort to the top instead of the bottom",
    anchor: "about",
  },
  location: {
    label: "your location",
    why: "so nearby trials outrank ones across the country",
    anchor: "about",
  },
}

/** The own-profile page, where every field editor lives. */
export const PROFILE_HREF = "/profile"

export function profileFieldHref(field: string): string {
  const anchor = MISSING_FIELD_META[field]?.anchor
  return anchor ? `${PROFILE_HREF}#${anchor}` : PROFILE_HREF
}
