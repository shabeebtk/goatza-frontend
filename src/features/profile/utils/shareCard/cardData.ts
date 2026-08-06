/**
 * Flatten the public profile bundle into the handful of values the card draws.
 *
 * The one place that knows the bundle's shape. `ProfileCard` takes `CardData`
 * and nothing else, so a change to the API payload lands here rather than in
 * the layout, and the layout can be rendered from a literal in a test.
 */

import type {
  PublicCareerEntry,
  PublicUserBundle,
} from "@/features/profile/services/publicProfile.api"
import { avatarDerivative, coverDerivative } from "./media"
import { buildSlotCatalog, resolveSlots } from "./slots"
import type { CardClub, CardData, CardFormat } from "./types"

/**
 * Up to two initials, from the first and last words. Used for both the avatar
 * fallback medallion and the club monogram.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"

  const first = words[0][0] ?? ""
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : ""

  return `${first}${last}`.toUpperCase()
}

/**
 * The club block: the player's current verified stint, or their most recent
 * one.
 *
 * Only `verified` counts. `self_reported` is a claim the player typed, and
 * printing it above "Verified by the club on Goatza" would turn the card into a
 * way to launder an unverified claim through our branding.
 */
function verifiedClub(career: PublicCareerEntry[]): CardClub | null {
  const verified = career.filter(
    (entry) => entry.verification_status === "verified" && entry.organization_name
  )
  if (verified.length === 0) return null

  // Current stints first, then most recently started. `start_date` is an ISO
  // date string, so a plain string compare is a date compare.
  const best = verified.sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
    return String(b.start_date ?? "").localeCompare(String(a.start_date ?? ""))
  })[0]

  const name = String(best.organization_name)
  return { name, monogram: initials(name) }
}

/**
 * The footer's right-hand meta.
 *
 * Not `getRoleLabel`, which returns "Club / Academy Management" for `org_user`
 * — three times the width the footer row has for it. Everything outside the
 * three athlete-facing roles falls back to the neutral form.
 */
function kindLabel(role: string): string {
  const named: Record<string, string> = {
    player: "Player profile",
    coach: "Coach profile",
    scout: "Scout profile",
  }
  return named[role] ?? "Goatza profile"
}

export function toCardData(
  bundle: PublicUserBundle,
  format: CardFormat,
  requestedSlots: string | null | undefined
): CardData {
  const { profile } = bundle
  const catalog = buildSlotCatalog(profile)

  return {
    username: profile.username,
    name: profile.name || profile.username,
    ageGroup: profile.age_group,
    sport: profile.primary_sport?.sport ?? null,
    position: profile.primary_sport?.primary_position ?? null,
    avatarUrl: avatarDerivative(profile.profile_photo),
    coverUrl: coverDerivative(profile.cover_photo, format),
    club: verifiedClub(bundle.career ?? []),
    slots: resolveSlots(catalog, requestedSlots),
    kindLabel: kindLabel(profile.role),
  }
}
