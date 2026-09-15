
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    InfiniteData,
    QueryClient,
    useQuery,
} from "@tanstack/react-query"
import {
    createPostApi, CreatePostPayload,
    fetchPostsApi, FetchPostsParams, getMyPostSportsApi,
    toggleLikeApi, createCommentApi, fetchCommentsApi,
    fetchRepliesApi, Post, PostsListResponse, deletePostApi,
    PostComment, CommentsListResponse, updatePostApi, deleteCommentApi,
    savePostApi
} from "../services/posts.api"
import { useAuthStore } from "@/store/auth.store"
import { useToast } from "@/shared/components/ui/Toast/Toast"

// ── Every cache that holds posts ─────────────────────────────

/**
 * Every infinite query that holds `Post[]` under `pages[].results`, by key
 * prefix. A like, a comment count, an edit or a delete has to reach ALL of
 * them: the same post can be on screen in the home feed, in Explore, on a
 * profile, in Saved, in Mentions and in a search at once — and every one of
 * those lists opens the full-screen viewer now, which renders the cache
 * object it is handed. A list left out here shows a like that "didn't work"
 * until it refetches. Add the key when adding a list.
 */
export const POST_CACHE_KEYS = [
    ["posts", "list"],
    ["posts", "feed"],
    ["posts", "mentions"],
    ["posts", "saved"],
    ["feed", "list"],
    ["explore", "posts"],
    ["search", "posts"],
] as const

type PostPages = InfiniteData<{ results: Post[] }>

/** Stop in-flight refetches of every post list overwriting an optimistic change. */
export const cancelPostLists = (qc: QueryClient) =>
    Promise.all(
        POST_CACHE_KEYS.map((queryKey) => qc.cancelQueries({ queryKey: [...queryKey] }))
    )

/** Refetch the truth for every post list — the rollback after a failed mutation. */
export const invalidatePostLists = (qc: QueryClient) => {
    for (const queryKey of POST_CACHE_KEYS) {
        qc.invalidateQueries({ queryKey: [...queryKey] })
    }
}

/**
 * Apply `update` to `postId` wherever it is cached. Pages keep their extra
 * fields (cursor, count) through the spread; posts other than the target are
 * returned by reference, so memoized cards for them do not re-render.
 */
export const updatePostInAllLists = (
    qc: QueryClient,
    postId: string,
    update: (post: Post) => Post
) => {
    const updater = (old: PostPages | undefined): PostPages | undefined => {
        if (!old?.pages) return old
        return {
            ...old,
            pages: old.pages.map((page) => ({
                ...page,
                results: page.results.map((p) => (p.id === postId ? update(p) : p)),
            })),
        }
    }
    for (const queryKey of POST_CACHE_KEYS) {
        qc.setQueriesData<PostPages>({ queryKey: [...queryKey] }, updater)
    }
}

/** Drop `postId` from every cached list. */
export const removePostFromAllLists = (qc: QueryClient, postId: string) => {
    const remover = (old: PostPages | undefined): PostPages | undefined => {
        if (!old?.pages) return old
        return {
            ...old,
            pages: old.pages.map((page) => ({
                ...page,
                results: page.results.filter((p) => p.id !== postId),
            })),
        }
    }
    for (const queryKey of POST_CACHE_KEYS) {
        qc.setQueriesData<PostPages>({ queryKey: [...queryKey] }, remover)
    }
}


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
            updatePostInAllLists(qc, updated.id, () => updated)
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

/**
 * `enabled` is opt-out: the public profile already has its first page from the
 * server render and must not fire this — /posts/list is IsAuthenticated.
 */
export const usePostsList = (
    params: FetchPostsParams = {},
    limit = LIMIT,
    enabled = true
) =>
    useInfiniteQuery<PostsListResponse, Error>({
        queryKey: postKeys.list({ ...params, limit }),
        queryFn: ({ pageParam = 0 }) =>
            fetchPostsApi({ ...params, limit, offset: pageParam as number }),
        enabled,
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
            await cancelPostLists(qc)

            // Optimistic update on EVERY post list in the cache (POST_CACHE_KEYS):
            // the feed, Explore, a profile, Saved, Mentions and a search can all
            // show this post, and each opens a viewer that renders the cache.
            updatePostInAllLists(qc, payload.post_id, (p) => {
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
            })

            // we don't return previous context since we update multiple queries.
            // On error we will just invalidate everything.
            return {}
        },
        onError: () => {
            // Rollback on error by invalidating so it fetches the truth
            invalidatePostLists(qc)
        },
        // We REMOVED onSettled invalidateQueries.
        // The optimistic update handles the UI instantly, and we trust it. 
        // Refetching the entire feed on every interaction is extremely unoptimized.
    })
}

// ── Save / unsave with optimistic update ─────────────────────

// POST_CACHE_KEYS minus the saved list. The bookmark shows the same post in
// several of them at once, so a flip has to reach all of them or the user
// sees two different truths on two screens.
// `["posts","saved"]` is deliberately NOT here — see the remover below.
const POST_LIST_CACHE_KEYS = POST_CACHE_KEYS.filter(
    (queryKey) => !(queryKey[0] === "posts" && queryKey[1] === "saved")
)

/** The saved list is per-actor, exactly like the mentions list. */
export const savedPostKeys = {
    list: (actorType: string, actorId: string | null) =>
        ["posts", "saved", actorType, actorId] as const,
    all: ["posts", "saved"] as const,
}

export const useToggleSave = () => {
    const qc = useQueryClient()
    // The app's own Toast (ToastProvider wraps the root layout) — same one the
    // options sheet already uses for "Link copied" and "Post deleted", so all
    // three read as one system.
    const toast = useToast()

    return useMutation({
        mutationFn: savePostApi,

        onMutate: async (payload) => {
            type PostInfinite = InfiniteData<{ results: Post[] }>

            await Promise.all(
                [...POST_LIST_CACHE_KEYS, savedPostKeys.all].map((queryKey) =>
                    qc.cancelQueries({ queryKey: [...queryKey] })
                )
            )

            // Flip the flag wherever the post is on screen. Read the current
            // value off the cache rather than trusting a caller-supplied one,
            // so a double-tap can't desync from what is rendered.
            const flip = (old: PostInfinite | undefined): PostInfinite | undefined => {
                if (!old?.pages) return old
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        results: page.results.map((p) =>
                            p.id === payload.post_id ? { ...p, is_saved: !p.is_saved } : p
                        ),
                    })),
                }
            }

            for (const queryKey of POST_LIST_CACHE_KEYS) {
                qc.setQueriesData<PostInfinite>({ queryKey: [...queryKey] }, flip)
            }

            // On the saved list an unsave means the card no longer belongs
            // there at all — flipping a bookmark on a row that is about to
            // vanish would just flash. Saving somewhere else is picked up by
            // the invalidate in onSuccess rather than guessed into position.
            qc.setQueriesData<PostInfinite>(
                { queryKey: [...savedPostKeys.all] },
                (old) => {
                    if (!old?.pages) return old
                    return {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            results: page.results.filter((p) => p.id !== payload.post_id),
                        })),
                    }
                }
            )

            // Same contract as useToggleLike: no snapshot, onError refetches
            // the truth for every affected cache.
            return {}
        },

        onSuccess: (data) => {
            // The save lives behind the post's ⋯ menu, so nothing on the card
            // changes when it lands — this toast is the ONLY confirmation the
            // user gets. Driven by the server's answer, not the optimistic
            // guess, so it can never claim the opposite of what was stored.
            // Default position (top-right on desktop, a full-width strip under
            // the top bar on mobile — see Toast.module.css).
            toast.show({
                title: data.is_saved ? "Saved" : "Removed from saved",
                message: data.is_saved
                    ? "Find it in Saved posts. Only you can see this."
                    : undefined,
                icon: data.is_saved ? "mdi:bookmark" : "mdi:bookmark-remove-outline",
                duration: 2500,
            })

            // The saved list's membership and ordering are the server's to
            // decide (newest-saved first), so it is refetched rather than
            // reconstructed. Every other cache already flipped optimistically.
            qc.invalidateQueries({ queryKey: [...savedPostKeys.all] })
        },

        onError: () => {
            toast.show({
                title: "Couldn't update your saved posts",
                message: "Check your connection and try again.",
                variant: "error",
                duration: 4000,
            })
            for (const queryKey of [...POST_LIST_CACHE_KEYS, savedPostKeys.all]) {
                qc.invalidateQueries({ queryKey: [...queryKey] })
            }
        },
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

            // 1. Bump the post's comment count across every post list cache.
            await cancelPostLists(qc)
            updatePostInAllLists(qc, variables.post_id, (p) => ({
                ...p,
                comments_count: p.comments_count + 1,
            }))

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
            invalidatePostLists(qc)
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
            await cancelPostLists(qc)
            updatePostInAllLists(qc, vars.postId, (p) => ({
                ...p,
                comments_count: Math.max(0, p.comments_count - removed),
            }))

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
            invalidatePostLists(qc)
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
            await cancelPostLists(qc)

            // drop it from ALL post lists (POST_CACHE_KEYS)
            removePostFromAllLists(qc, postId)

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
            invalidatePostLists(qc)
        },
    })
}