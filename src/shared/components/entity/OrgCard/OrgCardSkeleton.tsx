import styles from "./OrgCard.module.css"

export default function OrgCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonLogo}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadline}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonHeadlineSm}`} />
    </div>
  )
}
