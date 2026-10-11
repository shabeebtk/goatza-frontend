"use client"

import { Icon } from "@iconify/react"
import { useSmartBack } from "@/shared/hooks/useSmartBack"
import styles from "./BackHeader.module.css"

interface BackHeaderProps {
  /** Heading shown next to the back arrow. */
  title?: string
  /**
   * A quiet second line under the title — whose page this is, usually. The
   * title says WHAT the list is ("Career"); this says whose.
   */
  subtitle?: string
  /**
   * Where to go when there is no in-app history to return to (e.g. the page
   * was opened from a shared link or a new tab). Defaults to the user
   * dashboard — pass the org-admin dashboard when used inside that area.
   */
  fallback?: string
}

/**
 * A back arrow + title row. The arrow goes back within the app, or falls back
 * to `fallback` when going back would leave the app (see useSmartBack).
 */
export default function BackHeader({ title, subtitle, fallback }: BackHeaderProps) {
  const goBack = useSmartBack(fallback)

  return (
    <header className={styles.header}>
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className={styles.backBtn}
      >
        <Icon icon="mdi:arrow-left" width={22} height={22} />
      </button>
      {(title || subtitle) && (
        <span className={styles.titleWrap}>
          {title && <span className={styles.title}>{title}</span>}
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </span>
      )}
    </header>
  )
}
