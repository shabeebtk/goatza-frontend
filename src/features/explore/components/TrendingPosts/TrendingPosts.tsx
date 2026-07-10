"use client"

import { useCallback, useEffect, useRef } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import { useExplorePosts } from "../../hooks/useExploreQueries"
import styles from "./TrendingPosts.module.css"

const SKELETON_COUNT = 4

function SectionHeader() {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>Trending</h2>
    </div>
  )
}

function LoadingMore() {
  return (
    <div className={styles.loadingMore}>
      <span className={styles.spinner} aria-hidden="true" />
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

/**
 * Explore "Trending" section — a vertical, infinitely-scrolling list of the
 * existing home-feed PostCard. Structure mirrors FeedList; the underlying hook
 * carries the seen_ids variety pattern so the list differs between visits.
 */
export default function TrendingPosts() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useExplorePosts()

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

  const posts = data?.pages.flatMap((p) => p.results) ?? []

  if (isLoading) {
    return (
      <section className={styles.section}>
        <SectionHeader />
        <div className={styles.list}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  // Quiet inline error — a failing trending section must not break the page.
  if (isError) {
    return (
      <section className={styles.section}>
        <SectionHeader />
        <div className={styles.errorCard}>
          <Icon
            icon="mdi:cloud-off-outline"
            width={22}
            height={22}
            className={styles.errorIcon}
            aria-hidden="true"
          />
          <span className={styles.errorText}>Couldn&apos;t load trending posts.</span>
          <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
            <Icon icon="mdi:refresh" width={14} height={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    )
  }

  // Finished loading with nothing → disappear (ExplorePage owns the all-empty state).
  if (posts.length === 0) return null

  return (
    <section className={styles.section}>
      <SectionHeader />

      <div className={styles.list}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} queryParams={{}} />
        ))}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      {isFetchingNextPage && <LoadingMore />}
      {!hasNextPage && <EndOfList />}
    </section>
  )
}
