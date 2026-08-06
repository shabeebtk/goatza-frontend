import api from "@/core/api/axios"
import type { Post } from "./posts.api"

// ── Types ────────────────────────────────────────────────────

export type MentionSuggestUser = {
  id: string
  username: string
  name: string
  profile_photo: string
}

export type MentionSuggestOrg = {
  id: string
  username: string
  name: string
  /** OrganizationProfile stores the avatar as `logo`, not `profile_photo`. */
  logo: string
}

export type MentionSuggestResponse = {
  users: MentionSuggestUser[]
  organizations: MentionSuggestOrg[]
}

export type MyMentionsResponse = {
  next_cursor: string | null
  results: Post[]
}

// ── API calls ────────────────────────────────────────────────

/**
 * Posts where the ACTIVE ACTOR is mentioned. Scoping happens entirely through
 * the X-Actor-* headers the axios client already attaches — the org-admin
 * shell gets the org's mentions from this exact call, with no extra param.
 */
export const fetchMyMentionsApi = async (params: {
  cursor?: string
}): Promise<MyMentionsResponse> => {
  const res = await api.get("/posts/mentions/my", { params })
  return res.data.data
}

export const fetchMentionSuggestionsApi = async (
  q: string
): Promise<MentionSuggestResponse> => {
  const res = await api.get("/posts/mention/suggest", { params: { q } })
  return res.data.data
}
