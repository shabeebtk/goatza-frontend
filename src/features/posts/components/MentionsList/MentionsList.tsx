"use client"

/**
 * MentionsList — the posts the ACTIVE ACTOR was named in.
 *
 * A thin list rather than PostsList: that component is keyed to a username +
 * offset paging, while this reads a cursor-paged, actor-scoped endpoint. Shape
 * follows SearchPostsList, which solved the same problem — one
 * IntersectionObserver drives paging, `fetchNextPage` is guarded by
 * hasNextPage && !isFetchingNextPage.
 *
 * Rendered by BOTH the user settings page and the org-admin page: the actor
 * headers already decide whose mentions come back, so the two lists are
 * separate with no props.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Icon } from "@iconify/react"
import PostCard from "@/features/posts/components/PostCard/PostCard"
import PostSkeleton from "@/features/posts/components/PostCard/PostCardSkeleton"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { useMyMentions } from "@/features/posts/hooks/useMentions"
import styles from "./MentionsList.module.css"

const SKELETON_COUNT = 3

// Stable reference so memoized PostCards don't re-render on each list render.
const EMPTY_QUERY_PARAMS: FetchPostsParams = {}

export default function MentionsList() {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useMyMentions()

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
        <span className={styles.errorText}>Couldn&apos;t load mentions.</span>
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
          icon="mdi:at"
          width={48}
          height={48}
          className={styles.emptyIcon}
          aria-hidden="true"
        />
        <p className={styles.emptyBody}>
          When someone mentions you in a post, it shows up here.
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
