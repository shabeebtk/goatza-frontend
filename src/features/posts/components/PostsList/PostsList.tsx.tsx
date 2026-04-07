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

import { useEffect, useRef, useCallback } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import { usePostsList } from "../../hooks/usePostMutations"
import type { FetchPostsParams } from "../../services/posts.api"
import styles from "./PostsList.module.css"
import Link from "next/link"

// ── Skeleton ──────────────────────────────────────────────────

function PostSkeleton() {
    return (
        <div className={styles.skeleton}>
            <div className={styles.skeletonHeader}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
                <div className={styles.skeletonLines}>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLineSm}`} />
                </div>
            </div>
            <div className={`${styles.skeletonBlock} ${styles.skeletonContent}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonMedia}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonActions}`} />
        </div>
    )
}

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
            <span>You're all caught up</span>
            <span className={styles.endDot} />
        </div>
    )
}

// ── Main PostsList ────────────────────────────────────────────

interface PostsListProps {
    username?: string
    isOwn?: boolean
    onCreatePost?: () => void
    preview?: boolean
}

export default function PostsList({
    username,
    isOwn = false,
    onCreatePost,
    preview = false
}: PostsListProps) {
    const queryParams: FetchPostsParams = username ? { username } : {}

    const {
        data,
        isLoading,
        isError,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = usePostsList(queryParams, preview ? 1 : undefined)

    // ── Infinite scroll via IntersectionObserver ──────────────────
    const sentinelRef = useRef<HTMLDivElement>(null)

    const handleObserver = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [entry] = entries
            if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage()
            }
        },
        [fetchNextPage, hasNextPage, isFetchingNextPage]
    )

    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const observer = new IntersectionObserver(handleObserver, {
            rootMargin: "200px",
            threshold: 0,
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [handleObserver])

    // ── All posts flat ────────────────────────────────────────────
    const allPosts = data?.pages.flatMap((p) => p.results) ?? []
    const totalCount = data?.pages[0]?.count ?? 0
    const displayPosts = preview ? allPosts.slice(0, 1) : allPosts

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
                        <Link href={`/profile/${username}/posts`} className={styles.viewAllBtn}>
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

            <div className={styles.list}>
                {displayPosts.map((post) => (   // ← displayPosts not allPosts
                    <PostCard
                        key={post.id}
                        post={post}
                        queryParams={queryParams}
                    />
                ))}
            </div>

            {/* Only show infinite scroll machinery in full mode */}
            {!preview && (
                <>
                    <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
                    {isFetchingNextPage && <LoadingMore />}
                    {!hasNextPage && allPosts.length > 0 && <EndOfList />}
                </>
            )}

        </div>
    )
}