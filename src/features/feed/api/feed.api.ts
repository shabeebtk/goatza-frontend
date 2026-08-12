import api from "@/core/api/axios"
import { useAuthStore } from "@/store/auth.store"
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

/**
 * Report posts the reader has actually seen.
 *
 * Fire-and-forget: the server answers 204 with no body and swallows junk ids,
 * so there is nothing to parse and nothing worth surfacing. Callers must not
 * await this in a render path.
 */
export const postImpressionsApi = async (postIds: string[]): Promise<void> => {
  if (postIds.length === 0) return
  await api.post("/feed/impressions", { post_ids: postIds })
}

/**
 * Background flush for a tab that is being hidden or unloaded.
 *
 * `navigator.sendBeacon` is the usual tool here, but it cannot carry the
 * Authorization header this API requires — every beacon would be a 401. A
 * `keepalive` fetch has the same guarantee (the request outlives the document)
 * and can authenticate, so it is what the tracker uses on the way out.
 *
 * Returns false when it could not even be attempted, so the caller can fall
 * back to the normal axios call.
 */
export const sendImpressionsBeacon = (postIds: string[]): boolean => {
  if (postIds.length === 0) return true
  if (typeof fetch === "undefined") return false

  const baseUrl = process.env.NEXT_PUBLIC_API_URL
  const { accessToken, actorType, actorId } = useAuthStore.getState()
  if (!baseUrl || !accessToken) return false

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Actor-Type": actorType,
  }
  if (actorType === "organization" && actorId) {
    headers["X-Actor-Id"] = actorId
  }

  try {
    void fetch(`${baseUrl}/feed/impressions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ post_ids: postIds }),
      keepalive: true,
      credentials: "include",
    }).catch(() => {
      // A tab on its way out has nowhere to show an error.
    })
    return true
  } catch {
    return false
  }
}
