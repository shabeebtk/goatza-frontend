"use client"

/**
 * PostsList
 *
 * Reusable for both:
 *   - Profile activities tab: <PostsList username="shabeebtk" isOwn />
 *   - Feed page:              <PostsList />
 *
 * Props:
 *   username   — filter by user (omit for feed)
 *   isOwn      — shows "Create Post" CTA in empty state
 *   onCreatePost — called when CTA button clicked
 */

import { useMemo, useCallback } from "react"
import { Icon } from "@iconify/react"
import LoadMoreError from "@/features/posts/components/LoadMoreError/LoadMoreError"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostViewerProvider from "@/features/posts/components/PostViewer/PostViewerProvider"
import { usePublicSection } from "@/features/profile/context/PublicProfileContext"
import { useLoadMoreSentinel } from "../../hooks/useLoadMoreSentinel"
import { usePostsList } from "../../hooks/usePostMutations"
import type { FetchPostsParams, Post } from "../../services/posts.api"
import { dedupePosts } from "../../utils/dedupePosts"
import styles from "./PostsList.module.css"
import Link from "next/link"
import PostSkeleton from "../PostCard/PostCardSkeleton"
import { useNavigation } from "@/shared/services/navigation.service"

// ── Empty state ───────────────────────────────────────────────

function EmptyState({
    isOwn,
    onCreatePost,
}: {
    isOwn: boolean
    onCreatePost?: () => void
}) {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
                <Icon icon="mdi:newspaper-variant-outline" width={48} height={48} />
            </div>
            <p className={styles.emptyTitle}>No posts yet</p>
            {isOwn ? (
                <>
                    <p className={styles.emptyBody}>
                        Share your highlights, achievements, and moments with your network.
                    </p>
                    {onCreatePost && (
                        <button
                            className={styles.emptyCreateBtn}
                            onClick={onCreatePost}
                            type="button"
                        >
                            <Icon icon="mdi:plus" width={18} height={18} />
                            Create Your First Post
                        </button>
                    )}
                </>
            ) : (
                <p className={styles.emptyBody}>Nothing shared yet.</p>
            )}
        </div>
    )
}

// ── Loading more indicator ────────────────────────────────────

function LoadingMore() {
    return (
        <div className={styles.loadingMore}>
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <span className={styles.loadingText}>Loading more…</span>
        </div>
    )
}

// ── End of list ───────────────────────────────────────────────

function EndOfList() {
    return (
        <div className={styles.endOfList}>
            <span className={styles.endDot} />
            <span>You&apos;re all caught up</span>
            <span className={styles.endDot} />
        </div>
    )
}

// ── Main PostsList ────────────────────────────────────────────

interface PostsListProps {
    username?: string
    postId?: string
    isOwn?: boolean
    type? : 'user' | 'organization'
    onCreatePost?: () => void
    preview?: boolean
}

export default function PostsList({
    username,
    postId,
    type='user',
    isOwn = false,
    onCreatePost,
    preview = false
}: PostsListProps) {

    const { toPostsList } = useNavigation()

    // Stable across renders (keyed on the actual filters) so the memoized
    // PostCards below don't re-render from a fresh object each time.
    const queryParams: FetchPostsParams = useMemo(() => {
        const p: FetchPostsParams = {}
        if (username) p.username = username
        if (postId) p.post_id = postId
        return p
    }, [username, postId])

    // On a public profile the first page of posts arrived with the
    // server-rendered bundle, already filtered by the same visibility rule the
    // authenticated list uses (posts.selectors.post_visibility_selectors with
    // actor=None → PUBLIC only). Passing an empty params object disables the
    // query, which is IsAuthenticated and would 401 for a logged-out visitor.
    //
    // Deliberately NOT paginated in public view: the "View all" link goes to
    // /profile/<username>/posts, which is its own public page.
    const publicPosts = usePublicSection<Post>("posts")

    const {
        data,
        isLoading: isFetching,
        isError: isFetchError,
        isFetchingNextPage,
        isFetchNextPageError,
        hasNextPage,
        fetchNextPage,
    } = usePostsList(queryParams, preview ? 1 : undefined, !publicPosts)

    // ── Infinite scroll via IntersectionObserver ──────────────────
    // The sentinel and the full-screen viewer both page this query. Without
    // cancelRefetch: false the second caller cancels the request in flight
    // and starts it again — the server does every page twice.
    const loadMore = useCallback(
        () => fetchNextPage({ cancelRefetch: false }),
        [fetchNextPage]
    )

    const sentinelRef = useLoadMoreSentinel({
        hasNextPage,
        isFetchingNextPage,
        isError: isFetchNextPageError,
        fetchNextPage: loadMore,
    })

    // ── All posts flat ────────────────────────────────────────────
    // Deduped: offset paging can repeat a row across a page boundary when a
    // post is added above it, and React must never see two children with
    // one key.
    const allPosts = useMemo(
        () => dedupePosts(publicPosts ?? data?.pages.flatMap((p) => p.results) ?? []),
        [publicPosts, data]
    )
    const totalCount = publicPosts
        ? publicPosts.length
        : data?.pages[0]?.count ?? 0
    const displayPosts = preview ? allPosts.slice(0, 1) : allPosts

    const isLoading = publicPosts ? false : isFetching
    // The full error state only when there is nothing to show: a failed NEXT
    // page also sets isError, and unmounting the list for that would take
    // the open viewer (and its history entry) down with it.
    const isError = publicPosts ? false : isFetchError && !data

    // ── Loading initial ───────────────────────────────────────────
    if (isLoading) {
        return (
            <div className={styles.list}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <PostSkeleton key={i} />
                ))}
            </div>
        )
    }

    // ── Error ─────────────────────────────────────────────────────
    if (isError) {
        return (
            <div className={styles.errorState}>
                <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
                <p>Failed to load posts.</p>
            </div>
        )
    }

    // ── Empty ─────────────────────────────────────────────────────
    if (allPosts.length === 0) {
        return (
            <EmptyState isOwn={isOwn} onCreatePost={onCreatePost} />
        )
    }
    return (
        <div className={styles.wrapper}>

            {/* Section header row — only in preview mode */}
            {preview && username && (
                <div className={styles.previewHeader}>
                    <h2 className={styles.previewTitle}>Posts</h2>
                    {totalCount > 1 && (
                        <Link
                            href={toPostsList(username, type)}
                            className={styles.viewAllBtn}
                        >
                            View All {totalCount} posts
                            <Icon icon="mdi:arrow-right" width={15} height={15} />
                        </Link>
                    )}
                </div>
            )}

            {/* Count header (full list / profile posts page) */}
            {!preview && username && totalCount > 0 && (
                <p className={styles.countHeader}>
                    {totalCount} post{totalCount !== 1 ? "s" : ""}
                </p>
            )}

            {/* The full-screen viewer swipes through this list and pages it
                through the same query. Not in preview mode: the profile tab
                shows ONE post with a "View all" link, and a viewer that
                walked a list the tab never renders would have nowhere to
                land — the card's own single-post viewer serves it, as it
                does on the single post page. The public (logged-out) list
                is unpaginated by design and simply ends. */}
            <PostViewerProvider
                posts={displayPosts}
                hasNextPage={!publicPosts && hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={loadMore}
                isError={isFetchNextPageError}
                endLabel="Back to posts"
                queryParams={queryParams}
                disabled={preview || Boolean(postId)}
            >
                <div className={styles.list}>
                    {displayPosts.map((post) => (   // ← displayPosts not allPosts
                        <div key={post.id} className={styles.feedItem}>
                            <PostCard
                                post={post}
                                queryParams={queryParams}
                                isPreview={preview}
                            />
                        </div>
                    ))}
                </div>
            </PostViewerProvider>

            {/* Only show infinite scroll machinery in full mode */}
            {!preview && (
                <>
                    <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
                    {isFetchingNextPage && <LoadingMore />}
                    {isFetchNextPageError && !isFetchingNextPage && <LoadMoreError onRetry={loadMore} />}
                    {!hasNextPage && allPosts.length > 0 && <EndOfList />}
                </>
            )}

        </div>
    )
}