import { Icon } from "@iconify/react"

import styles from "./BirthdateNotice.module.css"

/**
 * The calm warning under a date-of-birth field. Amber rather than error red:
 * nothing is wrong yet, and red next to a field reads as a mistake to fix.
 */
export default function BirthdateNotice({
  children,
  strong = false,
}: {
  children: React.ReactNode
  /** The last moment to change it, rather than the first reminder. */
  strong?: boolean
}) {
  return (
    <p className={`${styles.notice} ${strong ? styles.strong : ""}`} role="note">
      <Icon
        icon="mdi:alert-outline"
        width={15}
        height={15}
        className={styles.icon}
        aria-hidden="true"
      />
      <span>{children}</span>
    </p>
  )
}
