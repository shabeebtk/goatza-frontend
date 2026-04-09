"use client"

import { useEffect, useRef, useCallback } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import { useFeedList } from "../../hooks/useFeedQueries"
import styles from "./FeedList.module.css"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"


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
            <span>You're all caught up</span>
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
        hasNextPage,
        fetchNextPage,
    } = useFeedList()

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

    const allPosts = data?.pages.flatMap((p) => p.results) || []

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

    if (isError) {
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
            <div className={styles.list}>
                {allPosts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        queryParams={{}}
                    />
                ))}
            </div>

            <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
            {isFetchingNextPage && <LoadingMore />}
            {!hasNextPage && allPosts.length > 0 && <EndOfList />}
        </div>
    )
}
