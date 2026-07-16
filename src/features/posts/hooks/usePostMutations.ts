
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    InfiniteData,
    useQuery,
} from "@tanstack/react-query"
import {
    createPostApi, CreatePostPayload,
    fetchPostsApi, FetchPostsParams, getMyPostSportsApi,
    toggleLikeApi, createCommentApi, fetchCommentsApi,
    fetchRepliesApi, Post, PostsListResponse, deletePostApi,
    PostComment, CommentsListResponse, updatePostApi, deleteCommentApi
} from "../services/posts.api"
import { useAuthStore } from "@/store/auth.store"


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

// ── Edit post — replace the edited post everywhere with server truth ──
export const useUpdatePost = () => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: updatePostApi,
        onSuccess: (updated) => {
            type PostInfinite = InfiniteData<{ results: Post[] }>
            const replace = (old: PostInfinite | undefined): PostInfinite | undefined => {
                if (!old) return old
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        results: page.results.map((p) => (p.id === updated.id ? updated : p)),
                    })),
                }
            }
            qc.setQueriesData<PostInfinite>({ queryKey: ["posts", "list"] }, replace)
            qc.setQueriesData<PostInfinite>({ queryKey: ["feed", "list"] }, replace)
            qc.setQueriesData<PostInfinite>({ queryKey: ["explore", "posts"] }, replace)
        },
    })
}



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
    // We ignore the specific `params` for the cache key because 
    // we want to universally apply the optimistic update to ALL instances 
    // of posts lists (feed, profile, etc.)

    return useMutation({
        mutationFn: toggleLikeApi,
        onMutate: async (payload) => {
            // Cancel any outgoing refetches so they don't overwrite our optimistic update
            await qc.cancelQueries({ queryKey: ["posts", "list"] })
            await qc.cancelQueries({ queryKey: ["feed", "list"] })
            await qc.cancelQueries({ queryKey: ["explore", "posts"] })

            const updatePages = (old: any) => {
                if (!old) return old
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
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
            }

            // Optimistic update using fuzzy matching on ALL posts lists in the cache
            qc.setQueriesData<InfiniteData<PostsListResponse>>({ queryKey: ["posts", "list"] }, updatePages)

            // Also update the Home feed which runs on a different query key!
            qc.setQueriesData({ queryKey: ["feed", "list"] }, updatePages)

            // …and the Explore trending feed (yet another key) so a reaction on a
            // post shown in Explore updates instantly too.
            qc.setQueriesData({ queryKey: ["explore", "posts"] }, updatePages)

            // we don't return previous context since we update multiple queries.
            // On error we will just invalidate everything.
            return {}
        },
        onError: () => {
            // Rollback on error by invalidating so it fetches the truth
            qc.invalidateQueries({ queryKey: ["posts", "list"] })
            qc.invalidateQueries({ queryKey: ["feed", "list"] })
            qc.invalidateQueries({ queryKey: ["explore", "posts"] })
        },
        // We REMOVED onSettled invalidateQueries.
        // The optimistic update handles the UI instantly, and we trust it. 
        // Refetching the entire feed on every interaction is extremely unoptimized.
    })
}

// ── Comments ──────────────────────────────────────────────────

export const useCreateComment = () => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createCommentApi,

        onMutate: async (variables) => {
            // Build an optimistic comment/reply from the ACTIVE actor (user or org)
            // so it appears instantly, then reconcile with server truth on success.
            const { user, actorType, currentOrganization } = useAuthStore.getState()
            const org = actorType === "organization" ? currentOrganization : null
            const isOrg = !!org

            const actor = org
                ? {
                    id: org.id,
                    username: org.username,
                    name: org.name,
                    logo: org.logo,
                    type: org.type,
                    headline: org.headline,
                }
                : {
                    id: user?.id ?? "me",
                    username: user?.username ?? "",
                    name: user?.name ?? "You",
                    profile_photo: user?.profile_photo,
                    headline: "",
                }

            const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const createdAt = new Date().toISOString()

            // 1. Bump the post's comment count across every feed/list cache.
            await qc.cancelQueries({ queryKey: ["posts", "list"] })
            await qc.cancelQueries({ queryKey: ["feed", "list"] })
            await qc.cancelQueries({ queryKey: ["explore", "posts"] })

            // Feed / profile-list / explore caches all hold `Post[]` under `results`
            // (with per-cache extra fields preserved via spread), so one typed
            // updater bumps the count across every surface.
            type PostPages = InfiniteData<{ results: Post[] }>
            const bumpCount = (old: PostPages | undefined): PostPages | undefined => {
                if (!old) return old
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        results: page.results.map((p) =>
                            p.id === variables.post_id
                                ? { ...p, comments_count: p.comments_count + 1 }
                                : p
                        ),
                    })),
                }
            }
            qc.setQueriesData<PostPages>({ queryKey: ["posts", "list"] }, bumpCount)
            qc.setQueriesData<PostPages>({ queryKey: ["feed", "list"] }, bumpCount)
            qc.setQueriesData<PostPages>({ queryKey: ["explore", "posts"] }, bumpCount)

            // 2. Insert the optimistic comment/reply into the open thread.
            await qc.cancelQueries({ queryKey: commentKeys.list(variables.post_id) })
            qc.setQueryData<InfiniteData<CommentsListResponse>>(
                commentKeys.list(variables.post_id),
                (old) => {
                    if (!old || old.pages.length === 0) return old

                    if (!variables.parent_id) {
                        // Top-level comment → prepend to the first page (newest first).
                        const optimistic: PostComment = {
                            id: tempId,
                            comment: variables.comment,
                            created_at: createdAt,
                            actor,
                            actor_type: isOrg ? "organization" : "user",
                            replies_count: 0,
                            replies_preview: [],
                        }
                        return {
                            ...old,
                            pages: old.pages.map((page, i) =>
                                i === 0
                                    ? { ...page, count: page.count + 1, results: [optimistic, ...page.results] }
                                    : page
                            ),
                        }
                    }

                    // Reply → append to the parent's preview + bump its reply count.
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            results: page.results.map((c) =>
                                c.id === variables.parent_id
                                    ? {
                                        ...c,
                                        replies_count: c.replies_count + 1,
                                        replies_preview: [
                                            ...(c.replies_preview ?? []),
                                            { id: tempId, comment: variables.comment, actor, reply_to: null, created_at: createdAt },
                                        ],
                                    }
                                    : c
                            ),
                        })),
                    }
                }
            )

            return {}
        },

        onSuccess: (_data, variables) => {
            // Reconcile the optimistic entry with server truth (real id/time).
            qc.invalidateQueries({ queryKey: commentKeys.list(variables.post_id) })
            if (variables.parent_id) {
                qc.invalidateQueries({ queryKey: commentKeys.replies(variables.parent_id) })
            }
            // The count was already bumped optimistically — skip the heavy
            // ["posts"] refetch (mirrors useToggleLike) so the feed doesn't reload.
        },

        onError: (_e, variables) => {
            // Roll back every optimistic change by refetching the truth.
            qc.invalidateQueries({ queryKey: ["posts", "list"] })
            qc.invalidateQueries({ queryKey: ["feed", "list"] })
            qc.invalidateQueries({ queryKey: ["explore", "posts"] })
            qc.invalidateQueries({ queryKey: commentKeys.list(variables.post_id) })
            if (variables.parent_id) {
                qc.invalidateQueries({ queryKey: commentKeys.replies(variables.parent_id) })
            }
        },
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

// ── Delete comment (author or post owner) ─────────────────────
// `parentId` present → deleting a reply. `repliesCount` (top-level only) is how
// many replies are removed along with it (for the post-count decrement).
export type DeleteCommentVars = {
    commentId: string
    postId: string
    parentId?: string | null
    repliesCount?: number
}

export const useDeleteComment = () => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: DeleteCommentVars) => deleteCommentApi(vars.commentId),

        onMutate: async (vars) => {
            const removed = vars.parentId ? 1 : 1 + (vars.repliesCount ?? 0)

            // 1. Decrement the post's comment count everywhere.
            await qc.cancelQueries({ queryKey: ["posts", "list"] })
            await qc.cancelQueries({ queryKey: ["feed", "list"] })
            await qc.cancelQueries({ queryKey: ["explore", "posts"] })

            type PostInfinite = InfiniteData<{ results: Post[] }>
            const dec = (old: PostInfinite | undefined): PostInfinite | undefined => {
                if (!old) return old
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        results: page.results.map((p) =>
                            p.id === vars.postId
                                ? { ...p, comments_count: Math.max(0, p.comments_count - removed) }
                                : p
                        ),
                    })),
                }
            }
            qc.setQueriesData<PostInfinite>({ queryKey: ["posts", "list"] }, dec)
            qc.setQueriesData<PostInfinite>({ queryKey: ["feed", "list"] }, dec)
            qc.setQueriesData<PostInfinite>({ queryKey: ["explore", "posts"] }, dec)

            // 2. Remove the comment / reply from the open thread.
            await qc.cancelQueries({ queryKey: commentKeys.list(vars.postId) })
            qc.setQueryData<InfiniteData<CommentsListResponse>>(
                commentKeys.list(vars.postId),
                (old) => {
                    if (!old) return old

                    if (vars.parentId) {
                        // Reply → drop from its parent's preview + reply count.
                        return {
                            ...old,
                            pages: old.pages.map((page) => ({
                                ...page,
                                results: page.results.map((c) =>
                                    c.id === vars.parentId
                                        ? {
                                            ...c,
                                            replies_count: Math.max(0, c.replies_count - 1),
                                            replies_preview: (c.replies_preview ?? []).filter(
                                                (r) => r.id !== vars.commentId
                                            ),
                                        }
                                        : c
                                ),
                            })),
                        }
                    }

                    // Top-level → remove the comment row entirely.
                    return {
                        ...old,
                        pages: old.pages.map((page, i) => ({
                            ...page,
                            count: i === 0 ? Math.max(0, page.count - 1) : page.count,
                            results: page.results.filter((c) => c.id !== vars.commentId),
                        })),
                    }
                }
            )

            return {}
        },

        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: commentKeys.list(vars.postId) })
            if (vars.parentId) {
                qc.invalidateQueries({ queryKey: commentKeys.replies(vars.parentId) })
            }
        },

        onError: (_e, vars) => {
            qc.invalidateQueries({ queryKey: ["posts", "list"] })
            qc.invalidateQueries({ queryKey: ["feed", "list"] })
            qc.invalidateQueries({ queryKey: ["explore", "posts"] })
            qc.invalidateQueries({ queryKey: commentKeys.list(vars.postId) })
        },
    })
}


export const useDeletePost = (options: { mode?: "preview" }) => {
    const qc = useQueryClient()

    return useMutation({
        mutationFn: deletePostApi,

        onMutate: async (postId: string) => {
            if (options?.mode === "preview") return

            // cancel ongoing queries
            await qc.cancelQueries({ queryKey: ["posts", "list"] })
            await qc.cancelQueries({ queryKey: ["posts", "feed"] })
            await qc.cancelQueries({ queryKey: ["feed", "list"] })
            await qc.cancelQueries({ queryKey: ["explore", "posts"] })

            const updatePages = (old: any) => {
                if (!old) return old

                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        results: page.results.filter((p: any) => p.id !== postId),
                    })),
                }
            }

            // update ALL post lists (profile/list, feed, and explore)
            qc.setQueriesData({ queryKey: ["posts", "list"] }, updatePages)
            qc.setQueriesData({ queryKey: ["posts", "feed"] }, updatePages)
            qc.setQueriesData({ queryKey: ["feed", "list"] }, updatePages)
            qc.setQueriesData({ queryKey: ["explore", "posts"] }, updatePages)

            return {}
        },

        onSuccess: () => {
            // preview mode - should refetch the posts when deleted
            if (options?.mode === "preview") {
                qc.invalidateQueries({ queryKey: ["posts", "list"] })
            }
        },

        onError: () => {
            // fallback → refetch truth
            qc.invalidateQueries({ queryKey: ["posts", "list"] })
            qc.invalidateQueries({ queryKey: ["posts", "feed"] })
            qc.invalidateQueries({ queryKey: ["feed", "list"] })
            qc.invalidateQueries({ queryKey: ["explore", "posts"] })
        },
    })
}