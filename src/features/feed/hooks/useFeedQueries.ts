import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchFeedApi, type FetchFeedParams, type FeedListResponse } from "../api/feed.api"

export const feedKeys = {
  list: () => ["feed", "list"] as const,
}

export const useFeedList = () => {
  return useInfiniteQuery<FeedListResponse, Error>({
    queryKey: feedKeys.list(),
    queryFn: async ({ pageParam }) => {
      const { cursor, seen_ids } = (pageParam as FetchFeedParams) || {}
      return fetchFeedApi({ cursor, seen_ids })
    },
    initialPageParam: { cursor: undefined, seen_ids: undefined },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.next_cursor) return undefined

      // Collect seen IDs from all pages
      const rawIds = allPages.flatMap((page) => page.results.map((r) => r.id))
      // Take up to max 30 unique IDs
      const uniqueSeen = Array.from(new Set(rawIds)).slice(-30)
      const seen_ids = uniqueSeen.join(",")

      return {
        cursor: lastPage.next_cursor,
        seen_ids: seen_ids || undefined,
      } as FetchFeedParams
    },
    staleTime: 1000 * 60 * 2,
  })
}
