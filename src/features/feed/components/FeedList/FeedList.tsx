"use client"

import { useMemo, useCallback } from "react"
import { Icon } from "@iconify/react"
import LoadMoreError from "@/features/posts/components/LoadMoreError/LoadMoreError"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostViewerProvider from "@/features/posts/components/PostViewer/PostViewerProvider"
import { useLoadMoreSentinel } from "@/features/posts/hooks/useLoadMoreSentinel"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { dedupePosts } from "@/features/posts/utils/dedupePosts"
import { useFeedList } from "../../hooks/useFeedQueries"
import { useImpressionTracker } from "../../hooks/useImpressionTracker"
import styles from "./FeedList.module.css"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"

// Stable empty reference so memoized PostCards never re-render from a fresh
// object literal on each FeedList render.
const EMPTY_QUERY_PARAMS: FetchPostsParams = {}

function EmptyState() {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
                <Icon icon="mdi:newspaper-variant-outline" width={48} height={48} />
            </div>
            <p className={styles.emptyTitle}>No posts yet</p>
            <p className={styles.emptyBody}>Check back later for new updates from your network.</p>
        </div>
    )
}

function LoadingMore() {
    return (
        <div className={styles.loadingMore}>
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <span className={styles.loadingText}>Loading more…</span>
        </div>
    )
}

function EndOfList() {
    return (
        <div className={styles.endOfList}>
            <span className={styles.endDot} />
            <span>You&apos;re all caught up</span>
            <span className={styles.endDot} />
        </div>
    )
}

export default function FeedList() {
    const {
        data,
        isLoading,
        isError,
        isFetchingNextPage,
        isFetchNextPageError,
        hasNextPage,
        fetchNextPage,
    } = useFeedList()

    // Independent of the pagination observer below: different threshold,
    // different job. See useImpressionTracker. markSeen is what the
    // full-screen viewer reports through — its posts never cross the
    // observer, but they were read all the same.
    const { getPostRef, markSeen } = useImpressionTracker()

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

    // Flatten once per data change, not on every render (e.g. isFetchingNextPage).
    // Deduped: the variety pattern can hand a post back twice across pages,
    // and React must never see two children with one key.
    const allPosts = useMemo(
        () => dedupePosts(data?.pages.flatMap((p) => p.results) ?? []),
        [data]
    )

    if (isLoading) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.list}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <PostSkeleton key={i} />
                    ))}
                </div>
            </div>
        )
    }

    // The full error state only when there is nothing to show: a failed NEXT
    // page also sets isError, and unmounting the list for that would take
    // the open viewer (and its history entry) down with it.
    if (isError && !data) {
        return (
            <div className={styles.errorState}>
                <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
                <p>Failed to load feed.</p>
            </div>
        )
    }

    if (allPosts.length === 0) {
        return <EmptyState />
    }

    return (
        <div className={styles.wrapper}>
            {/* The full-screen viewer swipes through THIS list and pages it
                through the same query, so the list already has every post
                the viewer loaded when it closes on one of them. */}
            <PostViewerProvider
                posts={allPosts}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                fetchNextPage={loadMore}
                isError={isFetchNextPageError}
                onPostSeen={markSeen}
                endLabel="Back to feed"
                queryParams={EMPTY_QUERY_PARAMS}
            >
                <div className={styles.list}>
                    {allPosts.map((post) => (
                        <div
                            key={post.id}
                            ref={getPostRef(post.id)}
                            className={styles.feedItem}
                        >
                            {/* The "Suggested" marker lives inside PostCard's header
                                (top-right), driven by post.feed_source. */}
                            <PostCard post={post} queryParams={EMPTY_QUERY_PARAMS} />
                        </div>
                    ))}
                </div>
            </PostViewerProvider>

            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
            {isFetchingNextPage && <LoadingMore />}
            {isFetchNextPageError && !isFetchingNextPage && <LoadMoreError onRetry={loadMore} />}
            {!hasNextPage && allPosts.length > 0 && <EndOfList />}
        </div>
    )
}
