import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type Relationship = {
  is_me: boolean
  is_following: boolean
  is_followed_by: boolean
  is_connected: boolean
  /**
   * A block exists in EITHER direction — the flag that swaps Follow/Message
   * for the blocked state. Symmetric on purpose: the blocked party must not be
   * able to tell which side blocked.
   *
   * In practice a viewer who was blocked never sees this profile at all (the
   * endpoint 404s for them), so in the payloads the client actually receives
   * this is true only for the blocker.
   */
  is_blocked: boolean
  /** THIS viewer did the blocking — the only case that offers Unblock. */
  is_blocked_by_me: boolean
}

export type PrimarySport = {
  sport: string
  icon_name: string
  experience_level: string
  primary_position: string | null
}

/**
 * Location shape returned by the API.
 *
 * Coordinates are optional because the PUBLIC profile payload deliberately
 * omits them — an exact point for a named individual, on a page anyone can
 * scrape, is a safety problem (see the backend's public serializer). Nothing
 * on the profile renders them; only `name`, `city` and `country_code` are read.
 */
export type UserLocation = {
  name: string
  city: string
  country_code: string
  latitude?: number
  longitude?: number
}

/** Location shape sent to the API (superset of UserLocation) */
export type LocationPayload = {
  name: string
  type: "city"
  city: string
  state: string
  country_code: string
  latitude: number
  longitude: number
  external_id: string
}

/**
 * A profile as the profile page renders it.
 *
 * Several fields are optional because the same component renders two payloads:
 * the authenticated `/user/<username>/details` response, and the anonymous
 * `/public/profile/<username>` one. The public payload is a strict subset —
 * no email, no verification flags, no raw birthdate — so anything it omits is
 * optional here and every read site must tolerate its absence.
 */
export type UserProfile = {
  id: string
  username: string
  /** Absent on the public payload — never sent to a logged-out visitor. */
  email?: string
  role: string
  name: string
  profile_photo: string
  cover_photo: string
  headline: string
  about: string
  height_cm: number | null
  weight_kg: number | null
  gender?: string | null
  /** ISO date "YYYY-MM-DD" or null. Absent on the public payload. */
  birthdate?: string | null
  /**
   * Server-derived age band ("U17" / "Senior"). Present on the public payload
   * INSTEAD of `birthdate`; the authenticated payload sends the date and the
   * client derives the same badge with ageGroupBadge().
   */
  age_group?: string | null
  location: UserLocation | null
  // Numbers on the public payload, strings on the authenticated one (which
  // serializes them through CharField). Every read site goes through Number().
  followers_count: string | number
  following_count: string | number
  connections_count: string | number
  /** Absent on the public payload. */
  is_email_verified?: boolean
  /**
   * The owner's own privacy setting, sent only on the authenticated payload.
   * Drives the Settings toggle; it governs the logged-out web view only.
   */
  is_public_profile?: boolean
  created_at: string
  primary_sport: PrimarySport | null
  relationship?: Relationship
  /**
   * Top-level twin of `relationship.is_blocked_by_me`, sent by the profile
   * endpoints. Present so the shell can decide what to render without
   * depending on `relationship` having been included.
   */
  is_blocked_by_me?: boolean
}

export type UsernameAvailability = {
  username: string
  available: boolean
}

/** Only include fields that actually changed — empty string clears in backend */
export type UpdateProfileDataPayload = {
  username?: string
  name?: string
  headline?: string
  about?: string
  height_cm?: number | null
  weight_kg?: number | null
  gender?: string | null
  /** ISO date "YYYY-MM-DD" or null to clear */
  birthdate?: string | null
  location?: LocationPayload | null
}

export type UpdateProfileLegacyPayload = {
  name?: string
  headline?: string
  about?: string
}

// ── Profile API ──────────────────────────────────────────────

export const getMyProfileApi = async (): Promise<UserProfile> => {
  const res = await api.get("/user/details", { params: { list_type: "full" } })
  return res.data.data
}

export const getUserProfileApi = async (username: string): Promise<UserProfile> => {
  const res = await api.get(`/user/${username}/details`, { params: { list_type: "full" } })
  return res.data.data
}

export const updateProfileApi = async (
  data: UpdateProfileLegacyPayload
): Promise<UserProfile> => {
  const res = await api.patch("/user/details", data)
  return res.data.data
}

export const updateProfileDataApi = async (
  data: UpdateProfileDataPayload
): Promise<UserProfile> => {
  const res = await api.patch("/user/update/profile/data", data)
  return res.data.data
}

export const checkUsernameApi = async (
  username: string
): Promise<UsernameAvailability> => {
  const res = await api.get("/user/check/username/availability", {
    params: { username },
  })
  if (!res.data.success) return { username, available: false }
  return res.data.data
}

// ── Connections API ──────────────────────────────────────────

export type FollowPayload = {
  target_type: "user"
  target_id: string
}

export const followUserApi = async (payload: FollowPayload): Promise<void> => {
  await api.post("/connections/user/follow", payload)
}

export const unfollowUserApi = async (payload: FollowPayload): Promise<void> => {
  await api.post("/connections/user/unfollow", payload)
}