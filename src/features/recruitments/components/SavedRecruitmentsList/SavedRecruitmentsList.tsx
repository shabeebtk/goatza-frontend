"use client"

/**
 * SavedRecruitmentsList — the recruitments the ACTIVE ACTOR bookmarked.
 *
 * Modeled on SavedPostsList: one IntersectionObserver drives paging,
 * `fetchNextPage` guarded by hasNextPage && !isFetchingNextPage, and the
 * ordinary card renders each row unchanged (the saved endpoint returns the
 * same card payload as the list ones).
 *
 * Nothing is passed in: the actor headers already decide whose shortlist comes
 * back. Unsaving removes the card from here, and that removal lives in
 * useToggleSaveRecruitment — so it happens the same way no matter which screen
 * the bookmark was tapped on.
 *
 * Closed and cancelled postings deliberately STAY in this list, wearing their
 * status badge. A shortlist is exactly where someone notices a deadline passed.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Icon } from "@iconify/react"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import { useSavedRecruitments } from "../../hooks/useSavedRecruitments"
import styles from "../RecruitmentsList/RecruitmentsList.module.css"

const SKELETON_COUNT = 3

export default function SavedRecruitmentsList() {
  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useSavedRecruitments()

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
      // Prefetch the next page ~600px early so the user never hits a wall.
      rootMargin: "600px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data]
  )

  if (isLoading) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <RecruitmentCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
        <p>Failed to load saved recruitments.</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.emptyState} role="status">
        <div className={styles.emptyIcon}>
          <Icon icon="mdi:bookmark-outline" width={44} height={44} />
        </div>
        <p className={styles.emptyTitle}>Nothing saved yet</p>
        <p className={styles.emptyBody}>
          Tap the bookmark on a recruitment to shortlist it. Only you can see
          what you save.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.list}>
        {items.map((item) => (
          <RecruitmentCard key={item.id} recruitment={item} />
        ))}
      </div>

      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />

      {isFetchingNextPage && (
        <div className={styles.loadingMore}>
          <span className={styles.loadingSpinner} aria-hidden="true" />
          <span className={styles.loadingText}>Loading more…</span>
        </div>
      )}

      {!hasNextPage && (
        <div className={styles.endOfList}>
          <span className={styles.endDot} />
          <span>All saved recruitments loaded</span>
          <span className={styles.endDot} />
        </div>
      )}
    </div>
  )
}
