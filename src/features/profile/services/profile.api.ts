import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type Relationship = {
  is_me: boolean
  is_following: boolean
  is_followed_by: boolean
  is_connected: boolean
}

export type PrimarySport = {
  sport: string
  icon_name: string
  experience_level: string
  primary_position: string | null
}

export type UserProfile = {
  id: string
  username: string
  email: string
  role: string
  name: string
  profile_photo: string
  cover_photo: string
  headline: string
  about: string
  height_cm: number | null
  weight_kg: number | null
  followers_count: string
  following_count: string
  connections_count: string
  is_email_verified: boolean
  created_at: string
  primary_sport: PrimarySport | null
  relationship?: Relationship
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

/** Legacy text-only update (kept for compatibility) */
export const updateProfileApi = async (
  data: UpdateProfileLegacyPayload
): Promise<UserProfile> => {
  const res = await api.patch("/user/details", data)
  return res.data.data
}

/** Full profile data update — username, name, headline, about, height, weight */
export const updateProfileDataApi = async (
  data: UpdateProfileDataPayload
): Promise<UserProfile> => {
  const res = await api.patch("/user/update/profile/data", data)
  return res.data.data
}

/** Check if a username is available */
export const checkUsernameApi = async (
  username: string
): Promise<UsernameAvailability> => {
  const res = await api.get("/user/check/username/availability", {
    params: { username },
  })
  // success:false means not allowed (special chars etc.)
  if (!res.data.success) {
    return { username, available: false }
  }
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