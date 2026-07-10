"use client"

/**
 * /search — placeholder. Real search lands in a later stage; for now this just
 * gives the explore search bar a valid destination with a working back button.
 */

import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./page.module.css"

export default function SearchPage() {
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
        <h1 className={styles.title}>Search</h1>
      </header>

      <div className={styles.body}>
        <Icon
          icon="mdi:magnify"
          width={40}
          height={40}
          className={styles.bodyIcon}
          aria-hidden="true"
        />
        <p className={styles.bodyText}>Search is coming soon.</p>
      </div>
    </div>
  )
}
