"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { useSearchPosts } from "../../hooks/useSearchQueries"
import styles from "./SearchPostsList.module.css"

const SKELETON_COUNT = 3

// Stable reference so memoized PostCards don't re-render on each list render.
const EMPTY_QUERY_PARAMS: FetchPostsParams = {}

interface SearchPostsListProps {
  /** Trimmed query (≥ 2 chars — the page gates this). */
  q: string
}

function SectionHeader() {
  return (
    <div className={styles.header}>
      <h2 className={styles.title}>Posts</h2>
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
 * "Posts" search section — a vertical, infinitely-scrolling list of PostCard.
 * Mirrors explore's TrendingPosts: one IntersectionObserver drives pagination,
 * `fetchNextPage` is guarded by hasNextPage && !isFetchingNextPage, and the
 * section hides itself when it settles empty (the page owns the all-empty copy).
 */
export default function SearchPostsList({ q }: SearchPostsListProps) {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useSearchPosts(q)

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
      // Preload well ahead of the true end for a seamless scroll.
      rootMargin: "600px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const posts = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data]
  )

  if (isLoading) {
    return (
      <section className={styles.section}>
        <SectionHeader />
        <div className={styles.list} aria-busy="true">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <PostSkeleton key={i} />
          ))}
        </div>
      </section>
    )
  }

  // Quiet inline error — a failing posts section must not blank the rails.
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
          <span className={styles.errorText}>Couldn&apos;t load posts.</span>
          <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
            <Icon icon="mdi:refresh" width={14} height={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    )
  }

  // Settled empty → disappear (the page owns the single all-empty state).
  if (posts.length === 0) return null

  return (
    <section className={styles.section}>
      <SectionHeader />

      <div className={styles.list} aria-busy={isFetching ? true : undefined}>
        {posts.map((post) => (
          <div key={post.id} className={styles.item}>
            <PostCard post={post} queryParams={EMPTY_QUERY_PARAMS} />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      {isFetchingNextPage && <LoadingMore />}
      {!hasNextPage && <EndOfList />}
    </section>
  )
}
