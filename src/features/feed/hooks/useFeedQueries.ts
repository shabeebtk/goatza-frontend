import { useInfiniteQuery } from "@tanstack/react-query"

import { useAuthStore } from "@/store/auth.store"
import { fetchFeedApi, type FetchFeedParams, type FeedListResponse } from "../api/feed.api"

export const feedKeys = {
  all: ["feed"] as const,
  lists: () => ["feed", "list"] as const,
  /** One cache tree per acting identity — the feed is ranked per actor. */
  list: (actor: string) => ["feed", "list", actor] as const,
}

/**
 * The acting actor as one cache-key string.
 *
 * Matches useNotificationActorKey: a user actor has no `actorId`, so the
 * logged-in user's own id stands in. Without this a person's club feed and
 * their personal feed would share one cache entry, and switching accounts would
 * show the wrong ranking until it refetched.
 */
export const useFeedActorKey = () => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)
  const userId = useAuthStore((s) => s.user?.id)

  return actorType === "organization" && actorId
    ? `org:${actorId}`
    : `user:${userId ?? ""}`
}

export const useFeedList = () => {
  const actor = useFeedActorKey()

  return useInfiniteQuery<FeedListResponse, Error>({
    queryKey: feedKeys.list(actor),
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
