import GoatzaTile from "../GoatzaTile/GoatzaTile"
import styles from "./HomeScreenIllustration.module.css"

/** Where the Goatza tile sits in the 4 × 5 grid: third row, second column. */
const GOATZA_INDEX = 9
const GRID_TILES = 20
const DOCK_TILES = 4

/**
 * A phone's home screen: rows of muted app tiles with the Goatza tile lit in
 * brand. Pure decoration (aria-hidden); every claim it makes is in the text
 * beside it. Always dark, so it reads the same on the poster page, the banner
 * sheet and the landing page.
 */
export default function HomeScreenIllustration({ className }: { className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ""}`} aria-hidden="true">
      <span className={styles.notch} />
      <div className={styles.grid}>
        {Array.from({ length: GRID_TILES }, (_, index) =>
          index === GOATZA_INDEX ? (
            <span key={index} className={styles.cell}>
              <GoatzaTile size={40} highlighted className={styles.goatza} />
              <span className={styles.goatzaLabel}>Goatza</span>
            </span>
          ) : (
            <span key={index} className={styles.cell}>
              <span className={styles.tile} />
              <span className={styles.label} />
            </span>
          )
        )}
      </div>
      <div className={styles.dock}>
        {Array.from({ length: DOCK_TILES }, (_, index) => (
          <span key={index} className={styles.tile} />
        ))}
      </div>
    </div>
  )
}
