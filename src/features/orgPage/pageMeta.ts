import { orgTypeLabel } from "@/features/organization/orgTypeLabel"
import type { PublicOrganizationProfile } from "@/features/profile/services/publicProfile.api"

import { countLabel, formatAges } from "./format"
import type { PageShowcase } from "./types"

/**
 * The org profile's link-preview description. Without the page (any miss) it
 * is exactly what it always was; with it, the page's facts join in:
 * "Football academy in Kannur · Ages 6 – 18 · 4 programs · Enquire on Goatza".
 */

export const META_DESCRIPTION_MAX = 160

type MetaProfile = Pick<PublicOrganizationProfile, "headline" | "type" | "sports" | "locations">

/** "{Type} · {primary sport} · {city}", the missing ones skipped. */
function identityLine(profile: MetaProfile): string {
  const primaryLocation = profile.locations.find((location) => location.is_primary) ?? profile.locations[0]
  return [
    orgTypeLabel(profile.type),
    profile.sports.find((sport) => sport.is_primary)?.name ?? profile.sports[0]?.name,
    primaryLocation?.city,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** The description from before pages: the headline, or the identity line "on Goatza". */
export function legacyMetaDescription(profile: MetaProfile): string {
  return profile.headline || identityLine(profile).concat(" on Goatza")
}

/**
 * At most `max` characters, cut at a word boundary with an ellipsis, and never
 * ending on a dangling separator.
 */
export function cutAtWord(text: string, max = META_DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  // One character is kept for the ellipsis. A slice that already ends where a
  // word does is kept whole; otherwise it goes back to the last space.
  const room = clean.slice(0, max - 1)
  const atBoundary = clean.charAt(max - 1) === " "
  const space = room.lastIndexOf(" ")
  const words = atBoundary || space <= 0 ? room : room.slice(0, space)
  const cut = words.replace(/[\s·,;:–—-]+$/u, "")
  return `${cut}…`
}

export function profileMetaDescription(profile: MetaProfile, page: PageShowcase | null): string {
  if (!page) return legacyMetaDescription(profile)
  const programs = page.programs?.length ?? 0
  const parts = [
    profile.headline?.trim() || identityLine(profile),
    page.facts ? formatAges(page.facts.age_min, page.facts.age_max) : "",
    programs > 0 ? countLabel(programs, "program", "programs") : "",
    page.contact?.enquiry_form ? "Enquire on Goatza" : "",
  ].filter(Boolean)
  if (parts.length === 0) return legacyMetaDescription(profile)
  return cutAtWord(parts.join(" · "))
}
