import styles from "./UserCard.module.css"

export default function UserCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonBadge}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadline}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadlineSm}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonLocation}`} />
    </div>
  )
}
