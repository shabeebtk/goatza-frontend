"use client"

import { Icon } from "@iconify/react"

import styles from "./ReorderButtons.module.css"

/**
 * Move up / Move down, for a list the club puts in order. Each is named for what
 * it moves ("Move U12 Football up"), and the end a row can't leave is disabled.
 */
export default function ReorderButtons({
  name,
  isFirst,
  isLast,
  onMove,
  disabled,
}: {
  /** What the row is, for the buttons' names. */
  name: string
  isFirst: boolean
  isLast: boolean
  onMove: (delta: -1 | 1) => void
  disabled?: boolean
}) {
  return (
    <span className={styles.group}>
      <button
        type="button"
        className={styles.button}
        aria-label={`Move ${name} up`}
        disabled={disabled || isFirst}
        onClick={() => onMove(-1)}
      >
        <Icon icon="mdi:chevron-up" width={22} height={22} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label={`Move ${name} down`}
        disabled={disabled || isLast}
        onClick={() => onMove(1)}
      >
        <Icon icon="mdi:chevron-down" width={22} height={22} aria-hidden="true" />
      </button>
    </span>
  )
}
