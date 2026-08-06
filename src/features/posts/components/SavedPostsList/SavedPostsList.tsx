"use client"

/**
 * SavedPostsList — the posts the ACTIVE ACTOR bookmarked.
 *
 * Same shape as MentionsList (see it for why this isn't PostsList): one
 * IntersectionObserver drives paging, `fetchNextPage` is guarded by
 * hasNextPage && !isFetchingNextPage.
 *
 * Rendered by BOTH the user settings page and the org-admin page — the actor
 * headers already decide whose saves come back, so neither passes props.
 * Unsaving removes the card here; that removal lives in useToggleSave, so it
 * happens the same way no matter which screen the bookmark was tapped on.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
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
    hasNextPage,
    fetchNextPage,
  } = useSavedPosts()

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
      rootMargin: "600px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const posts = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
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

  if (isError) {
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
      <div className={styles.list} aria-busy={isFetching ? true : undefined}>
        {posts.map((post) => (
          <div key={post.id} className={styles.item}>
            <PostCard post={post} queryParams={EMPTY_QUERY_PARAMS} />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

      {isFetchingNextPage && (
        <div className={styles.loadingMore}>
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading more…</span>
        </div>
      )}

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
