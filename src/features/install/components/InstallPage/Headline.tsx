import type { Ref } from "react"
import styles from "./InstallPage.module.css"

/**
 * The page's two-line Bebas headline, the second line in brand. `focusable`
 * lets a state move focus to it (tabIndex -1: reachable by script, not by Tab).
 */
export default function Headline({
  top,
  bottom,
  headingRef,
  focusable = false,
}: {
  top: string
  bottom: string
  headingRef?: Ref<HTMLHeadingElement>
  focusable?: boolean
}) {
  return (
    <h1 ref={headingRef} className={styles.headline} tabIndex={focusable ? -1 : undefined}>
      <span className={styles.headlineLine}>{top}</span>
      <span className={styles.headlineAccent}>{bottom}</span>
    </h1>
  )
}
