import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query"
import {
  fetchExplorePlayers,
  fetchExploreOrganizations,
  fetchExplorePosts,
  type ExplorePlayersResponse,
  type ExploreOrgsResponse,
  type ExplorePostsResponse,
  type FetchExplorePlayersParams,
  type FetchExploreOrgsParams,
  type FetchExplorePostsParams,
} from "../api/explore.api"

// ── Query keys ────────────────────────────────────────────────

export const exploreKeys = {
  all: ["explore"] as const,
  players: () => ["explore", "players"] as const,
  // types is part of the key so switching the org filter refetches cleanly.
  orgs: (types: string) => ["explore", "orgs", types] as const,
  posts: () => ["explore", "posts"] as const,
}

// Explore lists change slowly relative to a session — keep them fresh ~2 min.
const STALE_TIME = 1000 * 60 * 2

// ── Players ───────────────────────────────────────────────────

export const useExplorePlayers = () =>
  useInfiniteQuery<ExplorePlayersResponse, Error>({
    queryKey: exploreKeys.players(),
    queryFn: ({ pageParam }) =>
      fetchExplorePlayers((pageParam as FetchExplorePlayersParams) || {}),
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

export const useExploreOrgs = (types = "") =>
  useInfiniteQuery<ExploreOrgsResponse, Error>({
    queryKey: exploreKeys.orgs(types),
    queryFn: ({ pageParam }) => {
      const { cursor } = (pageParam as FetchExploreOrgsParams) || {}
      return fetchExploreOrganizations({ types: types || undefined, cursor })
    },
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
