"use client"

import { Icon } from "@iconify/react"
import HorizontalRail from "../HorizontalRail/HorizontalRail"
import styles from "./ExploreRailShell.module.css"

interface ExploreRailShellProps {
  title: string
  seeAllHref?: string
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  onRetry: () => void
  onEndReached?: () => void
  isFetchingNextPage?: boolean
  /** Pre-rendered skeleton cards, shown while loading. */
  skeletons: React.ReactNode
  /** Pre-rendered entity cards. */
  children: React.ReactNode
}

/**
 * Presentational state machine shared by every explore rail:
 *   loading → skeletons · error → quiet inline retry · empty → nothing.
 * A failing rail returns its own error UI (never throws), so one broken
 * section can't take the page down.
 */
export default function ExploreRailShell({
  title,
  seeAllHref,
  isLoading,
  isError,
  isEmpty,
  onRetry,
  onEndReached,
  isFetchingNextPage,
  skeletons,
  children,
}: ExploreRailShellProps) {
  if (isLoading) {
    return <HorizontalRail title={title}>{skeletons}</HorizontalRail>
  }

  if (isError) {
    return (
      <HorizontalRail title={title}>
        <div className={styles.errorCard}>
          <Icon
            icon="mdi:cloud-off-outline"
            width={22}
            height={22}
            className={styles.errorIcon}
            aria-hidden="true"
          />
          <span className={styles.errorText}>Couldn&apos;t load this section.</span>
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            <Icon icon="mdi:refresh" width={14} height={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      </HorizontalRail>
    )
  }

  // Finished loading with nothing to show → the section disappears entirely.
  if (isEmpty) return null

  return (
    <HorizontalRail
      title={title}
      seeAllHref={seeAllHref}
      onEndReached={onEndReached}
      isFetchingNextPage={isFetchingNextPage}
    >
      {children}
    </HorizontalRail>
  )
}
