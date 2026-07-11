import {
  useQuery,
  useInfiniteQuery,
  keepPreviousData,
} from "@tanstack/react-query"
import {
  fetchExplorePlayers,
  fetchExploreOrganizations,
  type ExplorePlayersResponse,
  type ExploreOrgsResponse,
} from "@/features/explore/api/explore.api"
import {
  fetchSearchPosts,
  type SearchPostsResponse,
} from "../api/search.api"

// A query shorter than this never hits the network — matches the page gate that
// only reveals the result sections at ≥ 2 chars.
export const MIN_QUERY_LENGTH = 2

// Search results change slowly within a session — keep them fresh ~2 min, same
// as the explore lists.
const STALE_TIME = 1000 * 60 * 2

// ── Query keys ────────────────────────────────────────────────
// `q` is part of every key, so refining the query swaps caches cleanly. The
// caller passes an already-trimmed `q`, so keys never differ by whitespace.

export const searchKeys = {
  all: ["search"] as const,
  players: (q: string) => ["search", "players", q] as const,
  orgs: (q: string, types: string) => ["search", "orgs", types, q] as const,
  posts: (q: string) => ["search", "posts", q] as const,
}

const enabledFor = (q: string) => q.trim().length >= MIN_QUERY_LENGTH

// ── Players (first page only — rails don't infinite-scroll) ────

export const useSearchPlayers = (q: string) =>
  useQuery<ExplorePlayersResponse, Error>({
    queryKey: searchKeys.players(q),
    queryFn: () => fetchExplorePlayers({ search: q }),
    enabled: enabledFor(q),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

// ── Organizations (first page only) ───────────────────────────
// Called twice by the page: types "club,team" (Teams & Clubs) and "academy".

export const useSearchOrgs = (q: string, types: string) =>
  useQuery<ExploreOrgsResponse, Error>({
    queryKey: searchKeys.orgs(q, types),
    queryFn: () => fetchExploreOrganizations({ search: q, types }),
    enabled: enabledFor(q),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })

// ── Posts (vertical infinite feed) ────────────────────────────
// Cursor pattern mirrors useExplorePosts, minus the seen_ids variety logic —
// search is a stable, chronological result set, not a shuffled discovery feed.

type PostsPageParam = { cursor?: string }

export const useSearchPosts = (q: string) =>
  useInfiniteQuery<SearchPostsResponse, Error>({
    queryKey: searchKeys.posts(q),
    queryFn: ({ pageParam }) =>
      fetchSearchPosts({ q, ...(pageParam as PostsPageParam) }),
    initialPageParam: { cursor: undefined } as PostsPageParam,
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor
        ? ({ cursor: lastPage.next_cursor } as PostsPageParam)
        : undefined,
    enabled: enabledFor(q),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  })
