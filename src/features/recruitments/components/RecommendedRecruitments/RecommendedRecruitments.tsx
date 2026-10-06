"use client"

/**
 * "Recommended for you", in full.
 *
 * The discover rail shows the top handful; this is the whole ranked feed
 * behind it, paginated. There is no separate "recommended" endpoint and none
 * is needed: `GET /recruitments/list` WITHOUT a `username` is already ordered
 * by `-match_score` for a player actor (the view calls the same
 * `RecruitmentDiscoverService.ranked_list` the rails are built from), and
 * every row comes back carrying its `match` context. So this page is that
 * list, unfiltered, under the heading the rail sent the reader here with.
 *
 * ONLY WHAT IS STILL OPEN. The server has already dropped drafts, closed and
 * cancelled postings and every trial whose day has ended (`build_list_queryset`,
 * non-owner branch), but it deliberately KEEPS a row whose application deadline
 * has passed — the "All" tab wants those, wearing their "Applications closed"
 * badge. A page headed "Recommended for you" does not: recommending something
 * nobody can apply to is not a recommendation. So the one remaining case is
 * filtered here, through `isAcceptingApplications` — the same rule the card's
 * own pill and Apply button read, never a second copy of it.
 *
 * Deliberately no filters either: filtering is what the hub's "All" tab is for,
 * and a filter bar here would make "recommended" mean two different things on
 * two screens. Anyone who wants to narrow it goes back and uses that one.
 *
 * The list styling is imported from RecruitmentsList rather than copied — the
 * grid, the two-column step, the skeleton states and the end-of-list row are
 * the same ones, and a second copy would drift from them.
 */

import { useCallback, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import { useRecruitmentsList } from "../../hooks/useRecruitments"
import { isAcceptingApplications } from "../../accepting"
import listStyles from "../RecruitmentsList/RecruitmentsList.module.css"
import styles from "./RecommendedRecruitments.module.css"

const SKELETON_COUNT = 4

export default function RecommendedRecruitments() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecruitmentsList()

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
    () =>
      (data?.pages.flatMap((page) => page.results) ?? []).filter(
        isAcceptingApplications
      ),
    [data]
  )

  /**
   * The server's count includes the deadline-passed rows filtered out above,
   * so it is NOT the number on screen and is never shown as one. It is only
   * asked whether there is anything at all, which it answers correctly.
   */
  const hasAnything = items.length > 0 || hasNextPage

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href="/recruitments" className={styles.back}>
          <Icon icon="mdi:arrow-left" width={18} height={18} />
          <span>Recruitments</span>
        </Link>

        <div className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true">
            <Icon icon="mdi:star-four-points-outline" width={20} height={20} />
          </span>
          <div className={styles.headingText}>
            <h1 className={styles.title}>Recommended for you</h1>
            <p className={styles.subtitle}>
              Open trials you can still apply to, best matches first.
            </p>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className={listStyles.wrapper} aria-busy="true">
          <div className={listStyles.list}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <RecruitmentCardSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* The wall only without data — a failed NEXT page must not blow the
          list away, the same rule every other list here follows. */}
      {!isLoading && isError && items.length === 0 && (
        <div className={listStyles.errorState} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
          <p>Couldn&apos;t load recommendations.</p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {/* Only once there is genuinely nothing left to fetch. A page that came
          back entirely deadline-passed filters to zero rows while more pages
          are still coming, and an empty state there would be a lie the
          sentinel below is in the middle of disproving. */}
      {!isLoading && !isError && !hasAnything && (
        <div className={listStyles.emptyState} role="status">
          <div className={listStyles.emptyIcon}>
            <Icon icon="mdi:star-four-points-outline" width={44} height={44} />
          </div>
          <p className={listStyles.emptyTitle}>Nothing to recommend yet</p>
          <p className={listStyles.emptyBody}>
            New trials are posted all the time. Adding your sport, positions
            and location to your profile is what sharpens these matches.
          </p>
        </div>
      )}

      {!isLoading && hasAnything && (
        <div className={listStyles.wrapper}>
          {items.length > 0 && (
            <div className={listStyles.list}>
              {items.map((item, i) => (
                <RecruitmentCard key={item.id} recruitment={item} index={i} />
              ))}
            </div>
          )}

          {/* OUTSIDE the list, and rendered on hasNextPage rather than on the
              visible count: a page that filtered down to nothing still has to
              be able to pull the next one, or the list stalls on an empty
              screen with more rows waiting behind it. */}
          {hasNextPage && (
            <div
              ref={sentinelRef}
              className={listStyles.sentinel}
              aria-hidden="true"
            />
          )}

          {(isFetchingNextPage || (hasNextPage && items.length === 0)) && (
            <div className={listStyles.loadingMore}>
              <span className={listStyles.loadingSpinner} aria-hidden="true" />
              <span className={listStyles.loadingText}>Loading more…</span>
            </div>
          )}

          {!hasNextPage && items.length > 0 && (
            <div className={listStyles.endOfList}>
              <span className={listStyles.endDot} />
              <span>That&apos;s everything open for you right now</span>
              <span className={listStyles.endDot} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
