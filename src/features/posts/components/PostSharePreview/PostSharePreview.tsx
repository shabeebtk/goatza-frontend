"use client"

import { Icon } from "@iconify/react"
import styles from "./PostSharePreview.module.css"

/**
 * Compact "what you're sharing" chip rendered at the top of the ShareSheet for
 * a post. Presentational + prop-driven so PostActions can feed it directly.
 *
 * Shows the first media thumbnail when the post has media, otherwise a text
 * snippet — mirroring how the post reads in the feed.
 */
interface PostSharePreviewProps {
  authorName: string
  /** First media thumbnail; absent for text-only posts. */
  thumbnailUrl?: string
  /** Post body, used as the snippet for text-only posts. */
  textSnippet?: string
}

export default function PostSharePreview({
  authorName,
  thumbnailUrl,
  textSnippet,
}: PostSharePreviewProps) {
  const hasMedia = Boolean(thumbnailUrl)

  return (
    <div className={styles.card}>
      <div className={styles.thumb}>
        {hasMedia ? (
          <img src={thumbnailUrl} alt="" className={styles.cover} loading="lazy" />
        ) : (
          <Icon
            icon="mdi:text-box-outline"
            width={22}
            height={22}
            className={styles.textIcon}
          />
        )}
      </div>

      <div className={styles.body}>
        <span className={styles.kicker}>
          <Icon icon="mdi:image-multiple-outline" width={12} height={12} />
          Post
        </span>
        <span className={styles.author}>{authorName}</span>
        {!hasMedia && textSnippet && (
          <span className={styles.snippet}>{textSnippet}</span>
        )}
      </div>
    </div>
  )
}
