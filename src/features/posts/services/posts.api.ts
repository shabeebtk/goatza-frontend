import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type PostMediaType = "image" | "video"
export type PostVisibility = "public" | "followers"
export type PostType = "normal"

export type PostLocation = {
  name:         string
  type:         string
  city?:        string
  state?:       string
  country_code: string
  latitude:     number
  longitude:    number
  external_id:  string
}

export type PostMediaPayload = {
  file_url: string
  public_id: string
  media_type: PostMediaType
  thumbnail_url?: string
  duration?: number          // seconds, video only
  order: number
}

export type CreatePostPayload = {
  content: string
  post_type: PostType
  visibility: PostVisibility
  sport_id?: string
  media?: PostMediaPayload[]
  location?:  PostLocation
}

export type PostMedia = {
  file_url: string
  media_type: "image" | "video"
  thumbnail_url: string
  duration: number | null
  order: number
}

export type PostSport = {
  id: string
  name: string
  icon_name: string
  icon_url: string
}

export type ReactionType = "like" | "fire" | "respect" | "funny"

export type PostReaction = {
  is_reacted: boolean
  type: ReactionType | null
}

export type Post = {
  id: string
  content: string
  post_type: string
  visibility: string
  likes_count: number
  likes_breakdown: Record<string, number>
  comments_count: number
  created_at: string
  author: PostAuthor
  author_type: string
  media: PostMedia[]
  sport: PostSport | null
  reaction: PostReaction
  location?: PostLocation | null
}


export type PostAuthor = {
  id: string
  username: string
  name: string
  profile_photo: string
  headline: string
}


export type PostsListResponse = {
  count: number
  limit: number
  offset: number
  results: Post[]
}
 



// ── User sport for selector ───────────────────────────────────

export type PostUserSport = {
  id: string             // user_sport id
  sport: {
    id: string
    name: string
    icon_name: string
  }
  is_primary: boolean
  experience_level: string
}

// ── API calls ─────────────────────────────────────────────────

export const createPostApi = async (payload: CreatePostPayload): Promise<Post> => {
  const res = await api.post("/posts/create", payload)
  return res.data.data
}

export const getMyPostSportsApi = async (): Promise<PostUserSport[]> => {
  const res = await api.get("/sports/user/me/sport/list")
  return res.data.data
}


// ── Params ────────────────────────────────────────────────────
 
export type FetchPostsParams = {
  username?: string   // filter by user; omit for feed
  limit?: number
  offset?: number
}
 
// ── API ───────────────────────────────────────────────────────
 
export const fetchPostsApi = async (
  params: FetchPostsParams
): Promise<PostsListResponse> => {
  const res = await api.get("/posts/list", { params: { limit: 10, ...params } })
  return res.data.data
}
 
export type ToggleLikePayload = {
  post_id: string
  type: ReactionType
}

export type ToggleLikeResponse = {
  post_id: string
  is_liked: boolean
  type: ReactionType | null
  likes_count: number
  likes_breakdown: Record<string, number>
}

export const toggleLikeApi = async (payload: ToggleLikePayload): Promise<ToggleLikeResponse> => {
  const res = await api.post(`/posts/like`, payload)
  return res.data.data
}

export type CreateCommentPayload = {
  post_id: string
  comment: string
  parent_id?: string
}

export const createCommentApi = async (payload: CreateCommentPayload) => {
  const res = await api.post(`/posts/comments/create`, payload)
  return res.data.data
}

export type CommentActor = {
  id: string
  username: string
  name: string
  profile_photo: string
  headline: string
}

export type ReplyPreview = {
  id: string
  comment: string
  actor: CommentActor
  reply_to: CommentActor | null
  created_at: string
}

export type PostComment = {
  id: string
  comment: string
  created_at: string
  actor: CommentActor
  actor_type: string
  replies_count: number
  replies_preview: ReplyPreview[]
}

export type CommentsListResponse = {
  count: number
  limit: number
  offset: number
  results: PostComment[]
}

export const fetchCommentsApi = async (params: { post_id: string, limit?: number, offset?: number }): Promise<CommentsListResponse> => {
  const res = await api.get(`/posts/comments/list`, { params: { limit: 20, ...params } })
  return res.data.data
}

export const fetchRepliesApi = async (params: { parent_id: string, limit?: number, offset?: number }): Promise<{ results: PostComment[] }> => {
  const res = await api.get(`/posts/comments/list/replies`, { params: { limit: 20, ...params } })
  return res.data.data
}