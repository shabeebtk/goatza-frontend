"use client"

/**
 * LikeBurst — the big bolt that pops out of a double-tap.
 *
 * Mount it with a fresh `key` per burst: the animation runs once and the
 * element removes itself when it ends, so a second double-tap always starts
 * from scratch instead of restarting mid-way. Under prefers-reduced-motion
 * globals.css collapses the animation to a single frame, which still gives
 * the tap an acknowledgement.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import styles from "./LikeBurst.module.css"

export default function LikeBurst() {
  const [done, setDone] = useState(false)
  if (done) return null

  return (
    <span
      className={styles.burst}
      aria-hidden="true"
      data-like-burst=""
      onAnimationEnd={() => setDone(true)}
    >
      <Icon icon="mdi:lightning-bolt" width={96} height={96} />
    </span>
  )
}
