import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type Relationship = {
  is_me: boolean
  is_following: boolean       // I follow them
  is_followed_by: boolean     // they follow me back
  is_connected: boolean       // mutual follow
}

export type PrimarySport = {
  sport: string
  icon_name: string          // iconify icon, e.g. "mdi:soccer"
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
  followers_count: string
  following_count: string
  connections_count: string
  is_email_verified: boolean
  created_at: string
  relationship?: Relationship   
  primary_sport: PrimarySport | null
}

export type UpdateProfilePayload = {
  name?: string
  headline?: string
  about?: string
}

export type UpdatePhotoPayload = {
  type: "profile" | "cover"
  file: File
}

export type FollowPayload = {
  target_type: "user"
  target_id: string           
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

export const updateProfileApi = async (data: UpdateProfilePayload): Promise<UserProfile> => {
  const res = await api.patch("/user/details", data)
  return res.data.data
}

export const updatePhotoApi = async ({ type, file }: UpdatePhotoPayload): Promise<UserProfile> => {
  const form = new FormData()
  form.append(type === "profile" ? "profile_photo" : "cover_photo", file)
  const res = await api.patch("/user/details", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data.data
}

// ── Connections API ──────────────────────────────────────────

export const followUserApi = async (payload: FollowPayload): Promise<void> => {
  await api.post("/connections/user/follow", payload)
}

export const unfollowUserApi = async (payload: FollowPayload): Promise<void> => {
  await api.post("/connections/user/unfollow", payload)
}