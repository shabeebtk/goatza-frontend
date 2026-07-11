import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query"
import {
  fetchExplorePlayers,
  fetchExploreOrganizations,
  fetchExplorePosts,
  type ExploreListFilters,
  type ExplorePlayersResponse,
  type ExploreOrgsResponse,
  type ExplorePostsResponse,
  type FetchExplorePlayersParams,
  type FetchExploreOrgsParams,
  type FetchExplorePostsParams,
} from "../api/explore.api"

// ── Filter normalisation ──────────────────────────────────────
// Strip undefined / empty values so equivalent filter states produce the same
// query key. An empty result means "no filters" → the key omits the object
// entirely, keeping the exact same key as the unfiltered rails.

const normalizeFilters = (
  filters?: ExploreListFilters
): Record<string, string | number> => {
  const out: Record<string, string | number> = {}
  if (!filters) return out
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (typeof value === "string" && value.trim() === "") return
    out[key] = value
  })
  return out
}

// ── Query keys ────────────────────────────────────────────────
// React Query hashes object keys stably (sorted), so a normalized filter object
// is a safe cache key — any filter change resets pagination cleanly.

export const exploreKeys = {
  all: ["explore"] as const,
  players: (filters?: ExploreListFilters) => {
    const clean = normalizeFilters(filters)
    return Object.keys(clean).length
      ? (["explore", "players", clean] as const)
      : (["explore", "players"] as const)
  },
  orgs: (types: string, filters?: ExploreListFilters) => {
    const clean = normalizeFilters(filters)
    return Object.keys(clean).length
      ? (["explore", "orgs", types, clean] as const)
      : (["explore", "orgs", types] as const)
  },
  posts: () => ["explore", "posts"] as const,
}

// Explore lists change slowly relative to a session — keep them fresh ~2 min.
const STALE_TIME = 1000 * 60 * 2

// ── Players ───────────────────────────────────────────────────
// Called with no args by the ExplorePage rail → key stays ["explore","players"]
// (unchanged cache/dedupe). With filters → key gains the normalized object.

export const useExplorePlayers = (filters?: ExploreListFilters) =>
  useInfiniteQuery<ExplorePlayersResponse, Error>({
    queryKey: exploreKeys.players(filters),
    queryFn: ({ pageParam }) =>
      fetchExplorePlayers({
        ...filters,
        ...(pageParam as FetchExplorePlayersParams),
      }),
    initialPageParam: { cursor: undefined } as FetchExplorePlayersParams,
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor
        ? ({ cursor: lastPage.next_cursor } as FetchExplorePlayersParams)
        : undefined,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

// ── Organizations ─────────────────────────────────────────────

export const useExploreOrgs = (types = "", filters?: ExploreListFilters) =>
  useInfiniteQuery<ExploreOrgsResponse, Error>({
    queryKey: exploreKeys.orgs(types, filters),
    queryFn: ({ pageParam }) =>
      fetchExploreOrganizations({
        ...filters,
        types: types || undefined,
        ...(pageParam as FetchExploreOrgsParams),
      }),
    initialPageParam: { cursor: undefined } as FetchExploreOrgsParams,
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor
        ? ({ cursor: lastPage.next_cursor } as FetchExploreOrgsParams)
        : undefined,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

// ── Trending posts ────────────────────────────────────────────
// seen_ids pageParam logic mirrors useFeedList: accumulate the ids shown so
// far (capped at 30) and pass them back so later pages stay varied.

export const useExplorePosts = () =>
  useInfiniteQuery<ExplorePostsResponse, Error>({
    queryKey: exploreKeys.posts(),
    queryFn: ({ pageParam }) => {
      const { cursor, seen_ids } = (pageParam as FetchExplorePostsParams) || {}
      return fetchExplorePosts({ cursor, seen_ids })
    },
    initialPageParam: {
      cursor: undefined,
      seen_ids: undefined,
    } as FetchExplorePostsParams,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.next_cursor) return undefined

      const rawIds = allPages.flatMap((page) => page.results.map((r) => r.id))
      const uniqueSeen = Array.from(new Set(rawIds)).slice(-30)
      const seen_ids = uniqueSeen.join(",")

      return {
        cursor: lastPage.next_cursor,
        seen_ids: seen_ids || undefined,
      } as FetchExplorePostsParams
    },
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
