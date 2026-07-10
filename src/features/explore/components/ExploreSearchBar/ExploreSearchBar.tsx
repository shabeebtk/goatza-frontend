"use client"

import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import styles from "./ExploreSearchBar.module.css"

/**
 * Looks like a search input but is a button — tapping it routes to the
 * dedicated /search page. Sticky at the top of the explore feed.
 */
export default function ExploreSearchBar() {
  const router = useRouter()

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.bar}
        onClick={() => router.push("/search")}
        aria-label="Search players, teams, and posts"
      >
        <Icon
          icon="mdi:magnify"
          width={20}
          height={20}
          className={styles.icon}
          aria-hidden="true"
        />
        <span className={styles.placeholder}>Search players, teams, posts...</span>
      </button>
    </div>
  )
}
