import styles from "./PageBodySkeleton.module.css"

/**
 * What a signed-in viewer sees in the section slots while the page read is on
 * its way: three light blocks shaped like a section (divider, title, a few
 * lines), so the sections land where the blocks were. No section bar yet.
 * Anonymous viewers never see it: the server seeds their page.
 */
export default function PageBodySkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading the page">
      {[0, 1, 2].map((index) => (
        <div key={index} className={styles.section} aria-hidden="true">
          <div className={styles.divider} />
          <div className={`${styles.block} ${styles.title}`} />
          <div className={`${styles.block} ${styles.line}`} />
          <div className={`${styles.block} ${styles.line}`} />
          <div className={`${styles.block} ${styles.line} ${styles.short}`} />
        </div>
      ))}
    </div>
  )
}
