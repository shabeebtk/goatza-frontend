import styles from "./RecruitmentCardSkeleton.module.css"

export default function RecruitmentCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.orgRow}>
        <div className={styles.avatarSkeleton} />
        <div className={styles.orgTextGroup}>
          <div className={`${styles.shimmer} ${styles.orgNameSkeleton}`} />
          <div className={`${styles.shimmer} ${styles.orgHeadlineSkeleton}`} />
        </div>
        <div className={`${styles.shimmer} ${styles.badgeSkeleton}`} />
      </div>

      <div className={styles.titleRow}>
        <div className={`${styles.shimmer} ${styles.sportIconSkeleton}`} />
        <div className={styles.titleBlock}>
          <div className={`${styles.shimmer} ${styles.titleSkeleton}`} />
          <div className={`${styles.shimmer} ${styles.descSkeleton}`} />
        </div>
      </div>

      <div className={styles.positionsRow}>
        <div className={`${styles.shimmer} ${styles.tagSkeleton}`} />
        <div className={`${styles.shimmer} ${styles.tagSkeleton}`} />
      </div>

      <div className={styles.metaRow}>
        <div className={`${styles.shimmer} ${styles.metaSkeleton}`} />
        <div className={`${styles.shimmer} ${styles.metaSkeleton}`} />
      </div>

      <div className={styles.footer}>
        <div className={`${styles.shimmer} ${styles.timeSkeleton}`} />
        <div className={`${styles.shimmer} ${styles.btnSkeleton}`} />
      </div>
    </div>
  )
}