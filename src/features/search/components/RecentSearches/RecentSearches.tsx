"use client"

import { Icon } from "@iconify/react"
import styles from "./RecentSearches.module.css"

interface RecentSearchesProps {
  recents: string[]
  onPick: (term: string) => void
  onRemove: (term: string) => void
  onClear: () => void
}

/**
 * Shown when the search box is empty (or below the 2-char threshold). Lists
 * recent queries as tappable rows; with none, a light hint invites a search.
 */
export default function RecentSearches({
  recents,
  onPick,
  onRemove,
  onClear,
}: RecentSearchesProps) {
  if (recents.length === 0) {
    return (
      <div className={styles.hint} role="status">
        <Icon
          icon="mdi:magnify"
          width={44}
          height={44}
          className={styles.hintIcon}
          aria-hidden="true"
        />
        <p className={styles.hintText}>
          Search players, teams, academies and posts
        </p>
      </div>
    )
  }

  return (
    <section className={styles.wrap} aria-label="Recent searches">
      <div className={styles.header}>
        <h2 className={styles.heading}>Recent</h2>
        <button type="button" className={styles.clearAll} onClick={onClear}>
          Clear all
        </button>
      </div>

      <ul className={styles.list}>
        {recents.map((term) => (
          <li key={term} className={styles.row}>
            <button
              type="button"
              className={styles.pick}
              onClick={() => onPick(term)}
            >
              <Icon
                icon="mdi:history"
                width={18}
                height={18}
                className={styles.rowIcon}
                aria-hidden="true"
              />
              <span className={styles.term}>{term}</span>
            </button>
            <button
              type="button"
              className={styles.remove}
              onClick={() => onRemove(term)}
              aria-label={`Remove ${term} from recent searches`}
            >
              <Icon icon="mdi:close" width={16} height={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
