import { useInfiniteQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import {
  fetchMyMentionsApi,
  type MyMentionsResponse,
} from "@/features/posts/services/mentions.api"

type MentionsPageParam = { cursor?: string }

/**
 * Posts the ACTIVE ACTOR is mentioned in.
 *
 * The actor is part of the cache key, not just the request headers: the same
 * endpoint returns the person's mentions or the org's depending on who is
 * acting, and sharing one cache entry between them would leak one list into
 * the other on an account switch.
 */
export const useMyMentions = () => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  return useInfiniteQuery<MyMentionsResponse, Error>({
    queryKey: ["posts", "mentions", "my", actorType, actorId],
    queryFn: ({ pageParam }) =>
      fetchMyMentionsApi({ ...(pageParam as MentionsPageParam) }),
    initialPageParam: { cursor: undefined } as MentionsPageParam,
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor
        ? ({ cursor: lastPage.next_cursor } as MentionsPageParam)
        : undefined,
    staleTime: 1000 * 60 * 2,
  })
}
