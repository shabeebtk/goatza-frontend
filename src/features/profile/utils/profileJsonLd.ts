/**
 * schema.org structured data for a public profile.
 *
 * Not decoration: it is what makes a Goatza profile eligible for a rich result
 * rather than a plain blue link, and search is the other half of "a profile URL
 * is worth sharing".
 *
 * Only fields the public payload actually carries are emitted — a JSON-LD blob
 * with empty strings in it is worse than a smaller one, because validators flag
 * it and crawlers discount the whole block.
 */

import type {
  PublicOrganizationProfile,
  PublicUserProfile,
} from "@/features/profile/services/publicProfile.api"

/** Drop null/undefined/empty values so the emitted object is clean. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0)
    )
  ) as T
}

export function personJsonLd(
  profile: PublicUserProfile,
  url: string
): Record<string, unknown> {
  const sports = profile.sports.map((s) => s.name)

  return compact({
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    alternateName: profile.username,
    url,
    image: profile.profile_photo,
    description: profile.headline || profile.about,
    // knowsAbout is the honest property for "these are the sports they play" —
    // there is no athlete-specific vocabulary term for a discipline.
    knowsAbout: sports,
    jobTitle: profile.primary_sport?.primary_position ?? undefined,
    // City-level only, exactly as the payload allows. Never a geo point.
    homeLocation: profile.location
      ? compact({
          "@type": "Place",
          address: compact({
            "@type": "PostalAddress",
            addressLocality: profile.location.city,
            addressCountry: profile.location.country_code,
          }),
        })
      : undefined,
  })
}

export function sportsOrganizationJsonLd(
  profile: PublicOrganizationProfile,
  url: string
): Record<string, unknown> {
  const primary =
    profile.locations.find((l) => l.is_primary) ?? profile.locations[0]

  return compact({
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: profile.name,
    alternateName: profile.username,
    url,
    logo: profile.logo,
    image: profile.cover_image || profile.logo,
    description: profile.headline || profile.description,
    sameAs: profile.website ? [profile.website] : undefined,
    sport: profile.sports.map((s) => s.name),
    address: primary
      ? compact({
          "@type": "PostalAddress",
          streetAddress: primary.address,
          addressLocality: primary.city,
          addressRegion: primary.state,
          addressCountry: primary.country_code,
        })
      : undefined,
  })
}
