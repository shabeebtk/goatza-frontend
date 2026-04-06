import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type PostMediaType = "image" | "video"
export type PostVisibility = "public" | "followers"
export type PostType = "normal"

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

export type Post = {
  id: string
  content: string
  post_type: string
  visibility: string
  likes_count: number
  comments_count: number
  created_at: string
  author: PostAuthor
  author_type: string
  media: PostMedia[]
  sport: PostSport | null
  is_liked: boolean
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
 
export const likePostApi = async (postId: string): Promise<void> => {
  await api.post(`/posts/${postId}/like`)
}
 
export const unlikePostApi = async (postId: string): Promise<void> => {
  await api.delete(`/posts/${postId}/like`)
}
 