"use client"

import { useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import styles from "./HorizontalRail.module.css"

interface HorizontalRailProps {
  title: string
  subtitle?: string
  seeAllHref?: string
  /** Fired when the end of the track scrolls into view (fetch next page). */
  onEndReached?: () => void
  isFetchingNextPage?: boolean
  children: React.ReactNode
}

export default function HorizontalRail({
  title,
  subtitle,
  seeAllHref,
  onEndReached,
  isFetchingNextPage = false,
  children,
}: HorizontalRailProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting) onEndReached?.()
    },
    [onEndReached]
  )

  useEffect(() => {
    const track = trackRef.current
    const sentinel = sentinelRef.current
    if (!track || !sentinel || !onEndReached) return

    const observer = new IntersectionObserver(handleIntersect, {
      root: track,
      // Preload horizontally: trigger 240px before the true end scrolls in.
      rootMargin: "0px 240px 0px 0px",
      threshold: 0,
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleIntersect, onEndReached])

  return (
    <section className={styles.rail}>
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>

        {seeAllHref && (
          <Link
            href={seeAllHref}
            className={styles.seeAll}
            aria-label={`See all ${title}`}
          >
            See all
            <Icon icon="mdi:arrow-right" width={16} height={16} aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* tabIndex makes the overflow container focusable → keyboard-scrollable. */}
      <div
        className={styles.track}
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={title}
      >
        {children}

        {isFetchingNextPage && (
          <div className={styles.spinnerSlot}>
            <span className={styles.spinner} aria-hidden="true" />
          </div>
        )}

        {onEndReached && (
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        )}
      </div>
    </section>
  )
}
