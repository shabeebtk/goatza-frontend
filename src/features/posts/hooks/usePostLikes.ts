import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchPostLikesApi, type PostLikesResponse } from "../services/posts.api"

// ── Query keys ───────────────────────────────────────────────

export const postLikesKeys = {
  all: () => ["posts", "likes"] as const,
  list: (postId: string) => ["posts", "likes", postId] as const,
}

const LIMIT = 20

/**
 * Offset-based infinite list of the actors who reacted to a post, newest first
 * (backend orders by `-created_at`). Only fetches while `enabled` (the modal is
 * open) so closed cards don't hit the network.
 */
export const usePostLikes = (postId: string, enabled: boolean) =>
  useInfiniteQuery<PostLikesResponse, Error>({
    queryKey: postLikesKeys.list(postId),
    queryFn: ({ pageParam = 0 }) =>
      fetchPostLikesApi({ post_id: postId, limit: LIMIT, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    enabled: enabled && !!postId,
    staleTime: 1000 * 30,
  })
