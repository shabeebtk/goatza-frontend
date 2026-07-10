import api from "@/core/api/axios"
import type { Post } from "@/features/posts/services/posts.api"

// ── Types ─────────────────────────────────────────────────────

export type ExploreMode = "nearby" | "popular"

/** Lightweight player card (ExploreUserSerializer). */
export type ExploreUser = {
  id: string
  name: string
  username: string
  role: string
  headline: string
  profile_photo: string
  city: string
  followers_count: number
  distance_km: number | null // null in "popular" mode
}

/** Lightweight organization card (ExploreOrgSerializer). */
export type ExploreOrg = {
  id: string
  name: string
  username: string
  type: string
  is_verified: boolean
  logo: string
  headline: string
  level: string
  city: string
  followers_count: number
  distance_km: number | null // null in "popular" mode
}

export type ExplorePlayersResponse = {
  next_cursor: string | null
  mode: ExploreMode
  results: ExploreUser[]
}

export type ExploreOrgsResponse = {
  next_cursor: string | null
  mode: ExploreMode
  results: ExploreOrg[]
}

export type ExplorePostsResponse = {
  next_cursor: string | null
  results: Post[]
}

// ── Params ────────────────────────────────────────────────────

export type FetchExplorePlayersParams = {
  cursor?: string
}

export type FetchExploreOrgsParams = {
  types?: string // comma-separated Organization.Type values (omit = all)
  cursor?: string
}

export type FetchExplorePostsParams = {
  cursor?: string
  seen_ids?: string // comma-separated post ids already shown (max 30)
}

// ── API calls ─────────────────────────────────────────────────

export const fetchExplorePlayers = async (
  params: FetchExplorePlayersParams = {}
): Promise<ExplorePlayersResponse> => {
  const res = await api.get("/feed/explore/players", { params })
  return res.data.data
}

export const fetchExploreOrganizations = async (
  params: FetchExploreOrgsParams = {}
): Promise<ExploreOrgsResponse> => {
  const res = await api.get("/feed/explore/organizations", { params })
  return res.data.data
}

export const fetchExplorePosts = async (
  params: FetchExplorePostsParams = {}
): Promise<ExplorePostsResponse> => {
  const res = await api.get("/feed/explore/posts", { params })
  return res.data.data
}
