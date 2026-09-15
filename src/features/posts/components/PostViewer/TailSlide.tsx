"use client"

/**
 * TailSlide — what comes after the last loaded post: a spinner while the
 * next page loads, "Try again" when it failed, a "Load more" button once the
 * auto-fetch has walked through five media-less pages, and the end of the
 * list with a way back to it.
 *
 * On the phone it is a full page in the vertical track (nothing scrolls past
 * it); on desktop the same content sits in a panel over the media.
 */

import { Icon } from "@iconify/react"
import type { TailSlide as TailSlideKind } from "./viewerList"
import styles from "./TailSlide.module.css"

interface TailSlideProps {
  kind: Exclude<TailSlideKind, null>
  /** The end slide's button — "Back to feed", "Back to explore". */
  endLabel: string
  onRetry: () => void
  onLoadMore: () => void
  onClose: () => void
  /** Phone: full page. Desktop: panel over the stage. */
  variant: "page" | "panel"
}

export default function TailSlide({
  kind,
  endLabel,
  onRetry,
  onLoadMore,
  onClose,
  variant,
}: TailSlideProps) {
  const className = `${styles.tail} ${variant === "page" ? styles.page : styles.panel}`

  if (kind === "loading") {
    return (
      <div className={className} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>Loading more…</span>
      </div>
    )
  }

  if (kind === "error") {
    return (
      <div className={className} role="alert">
        <Icon icon="mdi:cloud-off-outline" width={28} height={28} className={styles.icon} />
        <p className={styles.title}>Couldn&apos;t load more posts</p>
        <button type="button" className={styles.btn} onClick={onRetry}>
          <Icon icon="mdi:refresh" width={16} height={16} aria-hidden="true" />
          Try again
        </button>
      </div>
    )
  }

  if (kind === "load-more") {
    return (
      <div className={className}>
        <p className={styles.title}>More posts ahead</p>
        <p className={styles.body}>The next few pages had no photos or videos.</p>
        <button type="button" className={styles.btn} onClick={onLoadMore}>
          Load more posts
        </button>
      </div>
    )
  }

  return (
    <div className={className}>
      <span className={styles.endDots} aria-hidden="true">
        <span className={styles.endDot} />
        <span className={styles.endDot} />
        <span className={styles.endDot} />
      </span>
      <p className={styles.title}>You&apos;re all caught up</p>
      <button type="button" className={styles.btn} onClick={onClose}>
        {endLabel}
      </button>
    </div>
  )
}
