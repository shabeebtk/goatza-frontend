import { Icon } from "@iconify/react"

import styles from "./MediaUnavailableTile.module.css"

/**
 * Fills a photo or video bubble whose file is gone or will not load, in place of
 * the browser's broken-image glyph or an empty black box. Fills its parent, which
 * has already reserved the space, so the thread does not jump when a load fails.
 */
export default function MediaUnavailableTile() {
  return (
    <div className={styles.tile}>
      <Icon icon="mdi:information-outline" width={20} height={20} aria-hidden="true" />
      <span>Media unavailable</span>
    </div>
  )
}
