"use client"

import { useCallback, useMemo } from "react"
import { Icon } from "@iconify/react"
import LoadMoreError from "@/features/posts/components/LoadMoreError/LoadMoreError"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostViewerProvider from "@/features/posts/components/PostViewer/PostViewerProvider"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import { useLoadMoreSentinel } from "@/features/posts/hooks/useLoadMoreSentinel"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { dedupePosts } from "@/features/posts/utils/dedupePosts"
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
 * Mirrors explore's TrendingPosts: useLoadMoreSentinel drives pagination, the
 * full-screen viewer pages the same query, and the section hides itself when
 * it settles empty (the page owns the all-empty copy).
 */
export default function SearchPostsList({ q }: SearchPostsListProps) {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useSearchPosts(q)

  // The sentinel and the full-screen viewer both page this query. Without
  // cancelRefetch: false the second caller cancels the request in flight and
  // starts it again — the server does every page twice.
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

  // Deduped: a cursor list can repeat a row across a page boundary, and
  // React must never see two children with one key.
  const posts = useMemo(
    () => dedupePosts(data?.pages.flatMap((p) => p.results) ?? []),
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
  // Only with nothing to show: a failed NEXT page sets isError too, and
  // unmounting the list for that would take the open viewer down with it.
  if (isError && !data) {
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

      {/* The full-screen viewer swipes through the results and pages them
          through the same query. */}
      <PostViewerProvider
        posts={posts}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={loadMore}
        isError={isFetchNextPageError}
        endLabel="Back to results"
        queryParams={EMPTY_QUERY_PARAMS}
      >
        <div className={styles.list} aria-busy={isFetching ? true : undefined}>
          {posts.map((post) => (
            <div key={post.id} className={styles.item}>
              <PostCard post={post} queryParams={EMPTY_QUERY_PARAMS} />
            </div>
          ))}
        </div>
      </PostViewerProvider>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      {isFetchingNextPage && <LoadingMore />}
      {isFetchNextPageError && !isFetchingNextPage && <LoadMoreError onRetry={loadMore} />}
      {!hasNextPage && <EndOfList />}
    </section>
  )
}
