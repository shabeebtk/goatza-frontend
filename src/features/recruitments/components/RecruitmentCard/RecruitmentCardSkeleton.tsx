import styles from "./RecruitmentCardSkeleton.module.css"

/**
 * Mirrors RecruitmentCard's media-left row one-for-one — same media box, same
 * padding, same container breakpoint, same footer.
 *
 * Each text bar is a two-part element: the outer span carries the real
 * element's typography and a non-breaking space, so its line box is exactly
 * the height of the thing it stands in for, and the inner bar is painted
 * inside it absolutely. That keeps the card's height right by construction (a
 * padded bar would silently add its padding to every row), so the list does
 * not jump when the data lands.
 */
function Bar({ className }: { className: string }) {
  return (
    <span className={`${styles.line} ${className}`}>
      &nbsp;
      <i className={styles.bar} />
    </span>
  )
}

export default function RecruitmentCardSkeleton() {
  return (
    <div className={styles.cardWrap} aria-hidden="true">
      <div className={styles.card}>
        {/* The real media box's exact size — this is what reserves the row's
            height before anything loads. */}
        <div className={`${styles.media} ${styles.shimmer}`} />

        <div className={styles.content}>
          <div className={styles.rowTop}>
            <Bar className={styles.titleLine} />
            <span className={`${styles.shimmer} ${styles.pillBar}`}>&nbsp;</span>
          </div>

          <div className={styles.orgRow}>
            <div className={`${styles.avatar} ${styles.shimmer}`} />
            <Bar className={styles.orgBar} />
          </div>

          <div className={styles.facts}>
            <Bar className={styles.factBar} />
            <Bar className={`${styles.factBar} ${styles.factBarWide}`} />
          </div>

          <div className={styles.tagRow}>
            <span className={`${styles.shimmer} ${styles.tagBar}`}>&nbsp;</span>
            <Bar className={styles.quietBar} />
          </div>

          <div className={styles.spacer} />

          <div className={styles.footer}>
            <Bar className={styles.countBar} />
            <div className={styles.actions}>
              <div className={`${styles.shimmer} ${styles.iconBar}`} />
              <div className={`${styles.shimmer} ${styles.iconBar}`} />
              <span className={`${styles.shimmer} ${styles.actionBar}`}>&nbsp;</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
