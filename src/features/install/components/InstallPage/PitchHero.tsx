import HomeScreenIllustration from "../HomeScreenIllustration/HomeScreenIllustration"
import styles from "./InstallPage.module.css"

/** The pitch background on its own, for the hero and the desktop panel. */
export function Pitch() {
  return (
    <div className={styles.pitch} aria-hidden="true">
      <span className={styles.pitchHalfway} />
      <span className={styles.pitchCircle} />
    </div>
  )
}

export function Wordmark() {
  return (
    <span className={styles.wordmark} aria-hidden="true">
      GOATZA
    </span>
  )
}

/** The phone's home screen on a dark green pitch, under the wordmark. */
export default function PitchHero() {
  return (
    <div className={styles.hero} aria-hidden="true">
      <Pitch />
      <HomeScreenIllustration className={styles.heroPhone} />
      <span className={styles.heroScrim} />
      <Wordmark />
    </div>
  )
}
