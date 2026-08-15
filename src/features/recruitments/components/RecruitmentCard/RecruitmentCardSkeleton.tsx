import styles from "./RecruitmentCardSkeleton.module.css"

/**
 * Mirrors RecruitmentCard's spec grid one-for-one — same areas, same gaps,
 * same container breakpoint.
 *
 * Each text bar is a two-part element: the outer span carries the real
 * element's typography and a non-breaking space, so its line box is exactly
 * the height of the thing it stands in for, and the inner bar is painted
 * inside it absolutely. That keeps the card's height right by construction
 * (a padded bar would silently add its padding to every row) so the feed
 * doesn't jump when the data lands.
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
        <div className={styles.head}>
          <div className={styles.headTop}>
            <div className={styles.avatar} />
            <Bar className={styles.orgBar} />
          </div>
          <div className={styles.titleBlock}>
            <Bar className={styles.titleLine} />
            <Bar className={`${styles.titleLine} ${styles.titleLineShort}`} />
          </div>
        </div>

        <div className={styles.urg}>
          <Bar className={styles.urgBar} />
        </div>

        <div className={styles.body}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.cell}>
              <Bar className={styles.labelBar} />
              {/* The positions cell holds tags, which stand taller than a
                  line of text and set that grid row's height. */}
              <Bar
                className={`${styles.valueBar} ${i === 2 ? styles.valueBarTags : ""}`}
              />
            </div>
          ))}
        </div>

        <div className={styles.meta}>
          <Bar className={styles.metaBar} />
        </div>

        <div className={styles.cta}>
          <div className={`${styles.shimmer} ${styles.shareBar}`} />
          <span className={`${styles.shimmer} ${styles.viewBar}`}>&nbsp;</span>
        </div>
      </div>
    </div>
  )
}
