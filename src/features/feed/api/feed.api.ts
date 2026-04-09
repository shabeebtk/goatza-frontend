import api from "@/core/api/axios"
import type { Post } from "@/features/posts/services/posts.api"

export type FeedListResponse = {
  next_cursor: string | null
  results: Post[]
}

export type FetchFeedParams = {
  cursor?: string
  seen_ids?: string
}

export const fetchFeedApi = async (
  params: FetchFeedParams
): Promise<FeedListResponse> => {
  const res = await api.get("/feed/list", { params })
  return res.data.data
}
