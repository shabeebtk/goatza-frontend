import api from "@/core/api/axios"
import type { Post } from "./posts.api"

export type SavedPostsResponse = {
  next_cursor: string | null
  results: Post[]
}

/**
 * The ACTIVE ACTOR's saved posts. Scoping happens entirely through the
 * X-Actor-* headers the axios client already attaches — the org-admin shell
 * gets the org's saves from this exact call, with no extra param.
 */
export const fetchSavedPostsApi = async (params: {
  cursor?: string
}): Promise<SavedPostsResponse> => {
  const res = await api.get("/posts/saved/list", { params })
  return res.data.data
}
