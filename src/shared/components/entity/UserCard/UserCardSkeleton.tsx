import clsx from "clsx"
import styles from "./UserCard.module.css"

export default function UserCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={clsx(styles.card, className)} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadline}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadlineSm}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonBtn}`} />
    </div>
  )
}
