import { useInfiniteQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import { savedPostKeys } from "@/features/posts/hooks/usePostMutations"
import {
  fetchSavedPostsApi,
  type SavedPostsResponse,
} from "@/features/posts/services/saved.api"

type SavedPageParam = { cursor?: string }

/**
 * Posts the ACTIVE ACTOR saved, most recently saved first.
 *
 * The actor is part of the cache key, not just the request headers: a person
 * and an org they run have separate lists, and sharing one cache entry would
 * leak one into the other on an account switch.
 */
export const useSavedPosts = () => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  return useInfiniteQuery<SavedPostsResponse, Error>({
    queryKey: savedPostKeys.list(actorType, actorId),
    queryFn: ({ pageParam }) =>
      fetchSavedPostsApi({ ...(pageParam as SavedPageParam) }),
    initialPageParam: { cursor: undefined } as SavedPageParam,
    getNextPageParam: (lastPage) =>
      lastPage.next_cursor
        ? ({ cursor: lastPage.next_cursor } as SavedPageParam)
        : undefined,
    staleTime: 1000 * 60 * 2,
  })
}
