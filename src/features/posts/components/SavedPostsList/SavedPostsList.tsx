"use client"

/**
 * SavedPostsList — the posts the ACTIVE ACTOR bookmarked.
 *
 * Same shape as MentionsList (see it for why this isn't PostsList):
 * useLoadMoreSentinel drives paging, and the full-screen viewer pages the
 * same query.
 *
 * Rendered by BOTH the user settings page and the org-admin page — the actor
 * headers already decide whose saves come back, so neither passes props.
 * Unsaving removes the card here; that removal lives in useToggleSave, so it
 * happens the same way no matter which screen the bookmark was tapped on.
 */

import { useCallback, useMemo } from "react"
import { Icon } from "@iconify/react"
import LoadMoreError from "@/features/posts/components/LoadMoreError/LoadMoreError"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostViewerProvider from "@/features/posts/components/PostViewer/PostViewerProvider"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import { useLoadMoreSentinel } from "@/features/posts/hooks/useLoadMoreSentinel"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { dedupePosts } from "@/features/posts/utils/dedupePosts"
import { useSavedPosts } from "@/features/posts/hooks/useSavedPosts"
import styles from "@/features/posts/components/MentionsList/MentionsList.module.css"

const SKELETON_COUNT = 3

// Stable reference so memoized PostCards don't re-render on each list render.
const EMPTY_QUERY_PARAMS: FetchPostsParams = {}

export default function SavedPostsList() {
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
  } = useSavedPosts()

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
    () => dedupePosts(data?.pages.flatMap((page) => page.results) ?? []),
    [data]
  )

  if (isLoading) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    )
  }

  // The full error state only with nothing to show: a failed NEXT page sets
  // isError too, and unmounting the list for that would take the open
  // viewer (and its history entry) down with it.
  if (isError && !data) {
    return (
      <div className={styles.errorCard}>
        <Icon
          icon="mdi:cloud-off-outline"
          width={22}
          height={22}
          className={styles.errorIcon}
          aria-hidden="true"
        />
        <span className={styles.errorText}>Couldn&apos;t load saved posts.</span>
        <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
          <Icon icon="mdi:refresh" width={14} height={14} aria-hidden="true" />
          Retry
        </button>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className={styles.emptyState} role="status">
        <Icon
          icon="mdi:bookmark-outline"
          width={48}
          height={48}
          className={styles.emptyIcon}
          aria-hidden="true"
        />
        <p className={styles.emptyBody}>
          Posts you save will appear here. Only you can see them.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* The full-screen viewer swipes through this list and pages it
          through the same query, so the list already has every post the
          viewer loaded when it closes on one of them. */}
      <PostViewerProvider
        posts={posts}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={loadMore}
        isError={isFetchNextPageError}
        endLabel="Back to saved"
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

      {isFetchingNextPage && (
        <div className={styles.loadingMore}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading more…</span>
        </div>
      )}

      {isFetchNextPageError && !isFetchingNextPage && <LoadMoreError onRetry={loadMore} />}

      {!hasNextPage && (
        <div className={styles.endOfList}>
          <span className={styles.endDot} />
          <span>You&apos;re all caught up</span>
          <span className={styles.endDot} />
        </div>
      )}
    </>
  )
}
