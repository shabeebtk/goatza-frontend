
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    InfiniteData,
    useQuery,
} from "@tanstack/react-query"
import { createPostApi, CreatePostPayload, fetchPostsApi, FetchPostsParams, getMyPostSportsApi, likePostApi, Post, PostsListResponse, unlikePostApi } from "../services/posts.api"


export const useCreatePost = () =>
    useMutation({
        mutationFn: (payload: CreatePostPayload) => createPostApi(payload),
    })

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

// ── Like / Unlike with optimistic update ─────────────────────

export const useLikePost = (params: FetchPostsParams = {}) => {
    const qc = useQueryClient()
    const key = postKeys.list(params)

    const toggle = (postId: string, currentlyLiked: boolean) => {
        // Optimistic
        qc.setQueryData<InfiniteData<PostsListResponse>>(key, (old) => {
            if (!old) return old
            return {
                ...old,
                pages: old.pages.map((page) => ({
                    ...page,
                    results: page.results.map((p: Post) =>
                        p.id === postId
                            ? {
                                ...p,
                                is_liked: !currentlyLiked,
                                likes_count: currentlyLiked
                                    ? Math.max(0, p.likes_count - 1)
                                    : p.likes_count + 1,
                            }
                            : p
                    ),
                })),
            }
        })
    }

    const like = useMutation({
        mutationFn: likePostApi,
        onMutate: (postId) => toggle(postId, false),
        onError: () => qc.invalidateQueries({ queryKey: key }),
    })

    const unlike = useMutation({
        mutationFn: unlikePostApi,
        onMutate: (postId) => toggle(postId, true),
        onError: () => qc.invalidateQueries({ queryKey: key }),
    })

    return { like, unlike }
}