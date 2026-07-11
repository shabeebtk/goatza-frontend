"use client"

import { Fragment, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import { Icon } from "@iconify/react"
import Input from "@/shared/components/ui/Input/Input"
import styles from "./EntityListShell.module.css"

interface EntityListShellProps {
  title: string
  /** Controlled search box value (the caller debounces before it hits the query). */
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  /** True while any fetch is in flight (drives the input spinner + subtle dim). */
  isFetching?: boolean
  /** First-page load (no data yet) → skeleton grid. */
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  isEmpty: boolean
  /** A search term or filter is active → tailors the empty-state copy/action. */
  hasQueryOrFilters: boolean
  onClearFilters: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onEndReached: () => void
  /** Filter bar slot rendered under the search input. */
  filters?: React.ReactNode
  /** Returns ONE skeleton card; the shell repeats it across the grid. */
  renderSkeleton: () => React.ReactNode
  skeletonCount?: number
  /** The entity cards, rendered as direct grid children. */
  children: React.ReactNode
}

export default function EntityListShell({
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  isFetching = false,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  hasQueryOrFilters,
  onClearFilters,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
  filters,
  renderSkeleton,
  skeletonCount = 8,
  children,
}: EntityListShellProps) {
  const router = useRouter()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        onEndReached()
      }
    },
    [onEndReached, hasNextPage, isFetchingNextPage]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "300px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  // Input adornment: spinner while a search term is being fetched, else a clear ×.
  const searchPending = isFetching && searchValue.trim().length > 0
  const showClear = searchValue.length > 0 && !searchPending
  const rightIcon = searchPending ? (
    <Icon icon="mdi:loading" width={18} height={18} className={styles.spin} />
  ) : showClear ? (
    <Icon icon="mdi:close" width={18} height={18} />
  ) : undefined

  // Filter/search refetch (not first load, not pagination): keepPreviousData
  // holds the old list — dim it subtly instead of flashing skeletons.
  const isRefreshing = isFetching && !isLoading && !isFetchingNextPage

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.back}
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <Icon icon="mdi:arrow-left" width={22} height={22} />
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>

      <div className={styles.controls}>
        <Input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={`Search ${title.toLowerCase()}`}
          leftIcon={<Icon icon="mdi:magnify" width={18} height={18} />}
          rightIcon={rightIcon}
          onRightIconClick={showClear ? () => onSearchChange("") : undefined}
        />

        {filters}
      </div>

      {/* Loading — first page */}
      {isLoading && (
        <div className={styles.grid} aria-busy="true">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <Fragment key={i}>{renderSkeleton()}</Fragment>
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className={styles.stateBox} role="alert">
          <Icon
            icon="mdi:cloud-off-outline"
            width={40}
            height={40}
            className={styles.stateIcon}
            aria-hidden="true"
          />
          <p className={styles.stateTitle}>Couldn&apos;t load this list</p>
          <p className={styles.stateBody}>Something went wrong. Please try again.</p>
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            <Icon icon="mdi:refresh" width={16} height={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && isEmpty && (
        <div className={styles.stateBox}>
          <Icon
            icon="mdi:account-search-outline"
            width={40}
            height={40}
            className={styles.stateIcon}
            aria-hidden="true"
          />
          <p className={styles.stateTitle}>
            {hasQueryOrFilters ? "No results" : "Nothing here yet"}
          </p>
          <p className={styles.stateBody}>
            {hasQueryOrFilters
              ? "No matches for your search and filters. Try broadening them."
              : "Check back soon as the community grows."}
          </p>
          {hasQueryOrFilters && (
            <button type="button" className={styles.retryBtn} onClick={onClearFilters}>
              <Icon icon="mdi:filter-remove-outline" width={16} height={16} aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {!isLoading && !isError && !isEmpty && (
        <>
          <div
            className={clsx(styles.grid, isRefreshing && styles.gridUpdating)}
            role="list"
            aria-busy={isFetching ? true : undefined}
          >
            {children}
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
      )}
    </div>
  )
}
