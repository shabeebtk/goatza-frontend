import api from "@/core/api/axios"
import type { Post } from "@/features/posts/services/posts.api"

// ── Types ─────────────────────────────────────────────────────
// Posts search item shape is identical to the trending feed (PostListSerializer),
// so we reuse the shared `Post` type — the frontend PostCard works unchanged.

export type SearchPostsResponse = {
  next_cursor: string | null
  results: Post[]
}

export type FetchSearchPostsParams = {
  q: string
  cursor?: string
}

// ── API calls ─────────────────────────────────────────────────

/**
 * GET /posts/search?q=&cursor= — global search over public, live posts
 * (content + hashtag match). Keyset cursor pagination, page size 15.
 */
export const fetchSearchPosts = async ({
  q,
  cursor,
}: FetchSearchPostsParams): Promise<SearchPostsResponse> => {
  const res = await api.get("/posts/search", {
    params: { q, ...(cursor ? { cursor } : {}) },
  })
  return res.data.data
}
