
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    InfiniteData,
    useQuery,
} from "@tanstack/react-query"
import { createPostApi, CreatePostPayload, fetchPostsApi, FetchPostsParams, getMyPostSportsApi, toggleLikeApi, createCommentApi, fetchCommentsApi, fetchRepliesApi, Post, PostsListResponse } from "../services/posts.api"


export const useCreatePost = () => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreatePostPayload) => createPostApi(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["posts"] })
        },
    })
}

export const useMyPostSports = () =>
    useQuery({
        queryKey: ["myPostSports"],
        queryFn: getMyPostSportsApi,
        staleTime: 1000 * 60 * 10,
    })



const LIMIT = 10

// ── Query keys ────────────────────────────────────────────────

export const postKeys = {
    list: (p: FetchPostsParams) => ["posts", "list", p] as const,
    feed: () => ["posts", "feed"] as const,
}

// ── Infinite posts list ───────────────────────────────────────

export const usePostsList = (params: FetchPostsParams = {}, limit = LIMIT) =>
    useInfiniteQuery<PostsListResponse, Error>({
        queryKey: postKeys.list({ ...params, limit }), 
        queryFn: ({ pageParam = 0 }) =>
            fetchPostsApi({ ...params, limit, offset: pageParam as number }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
            return fetched < lastPage.count ? fetched : undefined
        },
        staleTime: 1000 * 60 * 2,
    })

// ── Reactions / Comments Query Keys ──────────────────────────

export const commentKeys = {
    list: (postId: string) => ["comments", "list", postId] as const,
    replies: (parentId: string) => ["comments", "replies", parentId] as const,
}

// ── Like / Unlike with optimistic update ─────────────────────

export const useToggleLike = (params: FetchPostsParams = {}) => {
    const qc = useQueryClient()
    const key = postKeys.list(params)

    return useMutation({
        mutationFn: toggleLikeApi,
        onMutate: async (payload) => {
            await qc.cancelQueries({ queryKey: key })
            const previous = qc.getQueryData<InfiniteData<PostsListResponse>>(key)

            // Optimistic update
            qc.setQueryData<InfiniteData<PostsListResponse>>(key, (old) => {
                if (!old) return old
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        results: page.results.map((p: Post) => {
                            if (p.id !== payload.post_id) return p
                            
                            const isChangingType = p.reaction.is_reacted && p.reaction.type !== payload.type
                            const newReacted = p.reaction.is_reacted && payload.type === p.reaction.type ? false : true
                            let newCount = p.likes_count
                            const newBreakdown = { ...(p.likes_breakdown || {}) }

                            if (!p.reaction.is_reacted) {
                                newCount += 1
                                newBreakdown[payload.type] = (newBreakdown[payload.type] || 0) + 1
                            } else if (isChangingType) {
                                if (p.reaction.type) {
                                    newBreakdown[p.reaction.type] = Math.max(0, (newBreakdown[p.reaction.type] || 0) - 1)
                                }
                                newBreakdown[payload.type] = (newBreakdown[payload.type] || 0) + 1
                            } else {
                                newCount = Math.max(0, p.likes_count - 1)
                                newBreakdown[payload.type] = Math.max(0, (newBreakdown[payload.type] || 0) - 1)
                            }
                            
                            return {
                                ...p,
                                likes_count: newCount,
                                likes_breakdown: newBreakdown,
                                reaction: {
                                    is_reacted: newReacted,
                                    type: newReacted ? payload.type : null,
                                }
                            }
                        }),
                    })),
                }
            })
            return { previous }
        },
        onError: (err, newLike, context) => {
            if (context?.previous) {
                qc.setQueryData(key, context.previous)
            }
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
        },
    })
}

// ── Comments ──────────────────────────────────────────────────

export const useCreateComment = () => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createCommentApi,
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: commentKeys.list(variables.post_id) })
            if (variables.parent_id) {
                qc.invalidateQueries({ queryKey: commentKeys.replies(variables.parent_id) })
            }
            qc.invalidateQueries({ queryKey: ["posts"] })
        }
    })
}

export const usePostComments = (postId: string) =>
    useInfiniteQuery({
        queryKey: commentKeys.list(postId),
        queryFn: ({ pageParam = 0 }) => fetchCommentsApi({ post_id: postId, limit: 10, offset: pageParam as number }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
            return fetched < lastPage.count ? fetched : undefined
        },
        enabled: !!postId,
    })

export const useCommentReplies = (parentId: string) =>
    useQuery({
        queryKey: commentKeys.replies(parentId),
        queryFn: () => fetchRepliesApi({ parent_id: parentId }),
        enabled: !!parentId,
    })