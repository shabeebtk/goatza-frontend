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
  is_following: boolean
  /** Visible-to-viewer clip count — batched with the page, drives the chip. */
  highlights_count?: number
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
  is_following: boolean
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

/** Shared listing filters (Stage 1 backend). */
export type ExploreListFilters = {
  search?: string
  sport_id?: string
  position_id?: string // players only
  lat?: number
  lng?: number
  radius_km?: number
  /**
   * Force a discovery mode instead of the backend's auto nearby-else-popular
   * pick. Used by the org explore page to render "Popular players" and
   * "Players near you" as two separate rails. Omit for the auto behavior.
   */
  mode?: ExploreMode
}

export type FetchExplorePlayersParams = ExploreListFilters & {
  cursor?: string
}

export type FetchExploreOrgsParams = Omit<ExploreListFilters, "position_id"> & {
  types?: string // comma-separated Organization.Type values (omit = all)
  cursor?: string
}

export type FetchExplorePostsParams = {
  cursor?: string
  seen_ids?: string // comma-separated post ids already shown (max 30)
}

/**
 * Drop undefined / null / empty-string values so we never send empty query
 * params. Numbers (incl. 0 — a valid latitude/longitude) are always kept.
 */
const toQuery = (
  params: Record<string, string | number | undefined>
): Record<string, string | number> => {
  const out: Record<string, string | number> = {}
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === "string" && value.trim() === "") return
    out[key] = value
  })
  return out
}

// ── API calls ─────────────────────────────────────────────────

export const fetchExplorePlayers = async (
  params: FetchExplorePlayersParams = {}
): Promise<ExplorePlayersResponse> => {
  const res = await api.get("/feed/explore/players", { params: toQuery(params) })
  return res.data.data
}

export const fetchExploreOrganizations = async (
  params: FetchExploreOrgsParams = {}
): Promise<ExploreOrgsResponse> => {
  const res = await api.get("/feed/explore/organizations", {
    params: toQuery(params),
  })
  return res.data.data
}

export const fetchExplorePosts = async (
  params: FetchExplorePostsParams = {}
): Promise<ExplorePostsResponse> => {
  const res = await api.get("/feed/explore/posts", { params })
  return res.data.data
}
