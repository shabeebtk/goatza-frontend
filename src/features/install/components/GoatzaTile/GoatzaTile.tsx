import type { CSSProperties } from "react"
import styles from "./GoatzaTile.module.css"

/**
 * The app's home-screen tile: the real icon, the one the phone will show.
 * Decorative everywhere it is used, so always aria-hidden. `highlighted` rings
 * it in brand, for the illustration's "this one is yours" tile.
 */
export default function GoatzaTile({
  size = 48,
  highlighted = false,
  className,
}: {
  size?: number
  highlighted?: boolean
  className?: string
}) {
  const style = { "--tile-size": `${size}px` } as CSSProperties
  return (
    <span
      className={[styles.tile, highlighted ? styles.highlighted : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className={styles.image} draggable={false} />
    </span>
  )
}
