import api from "@/core/api/axios"

// ── Master sports list types ──────────────────────────────────

export type SportPosition = {
  id: string
  name: string
}

export type SportAttributeOption = {
  id: string
  value: string
}

export type SportAttribute = {
  id: string
  name: string
  data_type: "select" | "multi_select" | "text" | "number"
  is_required: boolean
  display_order: number
  options: SportAttributeOption[]
}

export type Sport = {
  id: string
  name: string
  icon_name: string
  icon_url: string
  positions: SportPosition[]
  attributes: SportAttribute[]
}

// ── User sports types ─────────────────────────────────────────

export type UserSportPosition = {
  position: string
  is_primary: boolean
}

export type UserSportAttribute = {
  attribute: string
  value: string
}

export type UserSport = {
  id: string                   // user_sport record id
  sport: {
    id: string
    name: string
    icon_name: string
    icon_url: string
  }
  is_primary: boolean
  experience_level: string
  positions: UserSportPosition[]
  attributes: UserSportAttribute[]
}

// ── Payload types ─────────────────────────────────────────────

export type SportPositionPayload = {
  position_id: string
  is_primary: boolean
}

export type SportAttributePayload =
  | { attribute_id: string; option_id: string }
  | { attribute_id: string; value_text: string }

export type AddUserSportPayload = {
  sport_id: string
  is_primary: boolean
  experience_level: string
  positions: SportPositionPayload[]
  attributes: SportAttributePayload[]
}

export type UpdateUserSportPayload = {
  sport_id: string
  is_primary: boolean
  experience_level: string
  positions: SportPositionPayload[]
  attributes: SportAttributePayload[]
}

// ── API calls ─────────────────────────────────────────────────

/** All available sports with positions + attributes */
export const getSportsListApi = async (): Promise<Sport[]> => {
  const res = await api.get("/sports/list", { params: { list_type: "all" } })
  return res.data.data
}

/** Logged-in user's sports */
export const getUserSportsApi = async (): Promise<UserSport[]> => {
  const res = await api.get("/sports/user/me/sport/list", { params: { list_type: "all" } })
  return res.data.data
}

/** Any user's sports by username (for viewing other profiles) */
export const getUserSportsByUsernameApi = async (
  username: string
): Promise<UserSport[]> => {
  const res = await api.get(`/sports/user/${username}/sport/list`, {
    params: { list_type: "all" },
  })
  return res.data.data
}

export const addUserSportApi = async (
  payload: AddUserSportPayload
): Promise<UserSport> => {
  const res = await api.post("/sports/user/sport/add", payload)
  return res.data.data
}

export const updateUserSportApi = async (
  payload: UpdateUserSportPayload
): Promise<UserSport> => {
  const res = await api.post("/sports/user/sport/update", payload)
  return res.data.data
}

export const deleteUserSportApi = async (sportsId: string): Promise<void> => {
  await api.delete("/sports/user/sport/delete", { params: { sports_id: sportsId } })
}