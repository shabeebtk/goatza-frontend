import { SKELETON_STATUS } from "../../installCopy"
import { Pitch, Wordmark } from "./PitchHero"
import styles from "./InstallPage.module.css"

/**
 * The page's shape before the browser is known: on the server, during
 * hydration, and while an installed app is sent on to /home.
 */
export default function InstallSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.hero} aria-hidden="true">
        <Pitch />
        <Wordmark />
      </div>
      <div className={styles.body} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeleton} ${styles.skeletonTitleShort}`} />
        <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <span className={`${styles.skeleton} ${styles.skeletonLine}`} />
      </div>
      <div className={styles.actions} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonButton}`} />
      </div>
      <p className="sr-only" role="status">
        {SKELETON_STATUS}
      </p>
    </div>
  )
}
