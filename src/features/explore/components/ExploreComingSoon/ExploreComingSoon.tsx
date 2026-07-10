"use client"

import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./ExploreComingSoon.module.css"

/**
 * Placeholder for the "See all" destinations off the explore rails. The full
 * paginated listings land later; for now this keeps the links valid with a
 * working back button.
 */
export default function ExploreComingSoon({ title }: { title: string }) {
  const router = useRouter()

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

      <div className={styles.body}>
        <Icon
          icon="mdi:compass-outline"
          width={40}
          height={40}
          className={styles.bodyIcon}
          aria-hidden="true"
        />
        <p className={styles.bodyText}>Full listing coming soon.</p>
      </div>
    </div>
  )
}
