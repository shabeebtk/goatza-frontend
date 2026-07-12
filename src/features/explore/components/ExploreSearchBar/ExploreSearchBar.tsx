"use client"

import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./ExploreSearchBar.module.css"

/**
 * Looks like a search input but is a button — tapping it routes to the
 * dedicated search page. Sticky at the top of the explore feed. Routes via
 * useNavigation so it opens the org search page inside org-admin (and the
 * user search page otherwise) instead of always jumping to the user side.
 */
export default function ExploreSearchBar() {
  const router = useRouter()
  const { toSearch } = useNavigation()

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.bar}
        onClick={() => router.push(toSearch())}
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
