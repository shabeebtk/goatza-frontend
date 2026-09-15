"use client"

/**
 * LoadMoreError — the row at the bottom of a post list when the NEXT page
 * failed: the list stays, this says so and offers a retry.
 *
 * Every list used to answer `isError` with its full error state, and React
 * Query sets `isError` for a failed fetchNextPage too — so a server restart
 * or a throttled page took the whole list down, along with its viewer and
 * the history entry the viewer had reserved. Same shape as the lists'
 * "Loading more…" and "You're all caught up" rows, so it reads as one of
 * them rather than as a wall.
 */

import { Icon } from "@iconify/react"
import styles from "./LoadMoreError.module.css"

interface LoadMoreErrorProps {
  onRetry: () => void
}

export default function LoadMoreError({ onRetry }: LoadMoreErrorProps) {
  return (
    <div className={styles.row} role="alert">
      <span className={styles.text}>
        <Icon icon="mdi:cloud-off-outline" width={16} height={16} aria-hidden="true" />
        Couldn&apos;t load more posts
      </span>
      <button type="button" className={styles.retryBtn} onClick={onRetry}>
        <Icon icon="mdi:refresh" width={14} height={14} aria-hidden="true" />
        Try again
      </button>
    </div>
  )
}
