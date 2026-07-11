import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

/** Which list of a profile we're viewing. */
export type NetworkListType = "followers" | "following" | "connections"

/** Kind of entity a row points at. */
export type NetworkEntityType = "user" | "organization"

/** One row in a followers / following / connections list. */
export type NetworkRow = {
  type: NetworkEntityType
  id: string
  username: string
  name: string
  avatar: string
  headline: string
  is_verified: boolean
  /** Does the CURRENT actor follow this row's entity. */
  is_following: boolean
  /** Is this row the current actor itself. */
  is_me: boolean
}

export type FetchNetworkListParams = {
  /** The list to return. */
  type: NetworkListType
  /** Whose lists to return. */
  username: string
  search?: string
  limit?: number
  offset?: number
}

export type NetworkListResponse = {
  count: number
  limit: number
  offset: number
  results: NetworkRow[]
}

// ── API ──────────────────────────────────────────────────────

export const fetchNetworkListApi = async (
  params: FetchNetworkListParams
): Promise<NetworkListResponse> => {
  const res = await api.get("/connections/user/follow/list", { params })
  return res.data.data
}
