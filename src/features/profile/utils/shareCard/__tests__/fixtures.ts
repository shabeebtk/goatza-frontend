/**
 * A complete public profile bundle, and the knobs the card cares about.
 *
 * Built as an override-a-full-object rather than a builder chain, so a test
 * that cares about one missing field reads as `profile({ cover_photo: "" })`
 * and everything else stays realistic.
 */

import type {
  PublicUserBundle,
  PublicUserProfile,
} from "@/features/profile/services/publicProfile.api"

const MEDIA = "https://media.goatza.test/users/u1/"

export function profile(overrides: Partial<PublicUserProfile> = {}): PublicUserProfile {
  return {
    id: "0197f0e0-0000-7000-8000-000000000001",
    username: "aravind10",
    role: "player",
    created_at: "2025-03-14T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    name: "Aravind Menon",
    headline: "Winger · Calicut",
    about: "",
    profile_photo: `${MEDIA}profile.webp`,
    cover_photo: `${MEDIA}cover.webp`,
    followers_count: 120,
    following_count: 80,
    connections_count: 40,
    height_cm: 178,
    weight_kg: 68.5,
    age_group: "U19",
    location: { name: "Kozhikode, Kerala", city: "Kozhikode", country_code: "IN" },
    sports: [],
    positions: [],
    primary_sport: {
      sport: "Football",
      icon_name: "mdi:soccer",
      icon_url: "",
      experience_level: "advanced",
      primary_position: "Winger",
      attributes: [
        { name: "Preferred foot", data_type: "select", value: "Right" },
      ],
    },
    ...overrides,
  }
}

export function bundle(
  profileOverrides: Partial<PublicUserProfile> = {},
  career: Record<string, unknown>[] = [verifiedStint()]
): PublicUserBundle {
  return {
    type: "user",
    profile: profile(profileOverrides),
    highlights: [],
    career: career as PublicUserBundle["career"],
    achievements: [],
    posts: { count: 0, limit: 10, offset: 0, results: [] },
  }
}

export function verifiedStint(overrides: Record<string, unknown> = {}) {
  return {
    id: "0197f0e0-0000-7000-8000-000000000002",
    organization_name: "Calicut FC",
    verification_status: "verified",
    is_current: true,
    start_date: "2024-06-01",
    ...overrides,
  }
}
