"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { SharedPostPreview } from "../../services/conversations.api"
import styles from "./SharedPostMessage.module.css"

interface SharedPostMessageProps {
  preview: SharedPostPreview | null | undefined
  /** Optional sender caption (message.content), shown under the card. */
  caption?: string
  isMine: boolean
  showTime: boolean
  timeLabel: string
  pending?: boolean
  failed?: boolean
  /** Read by the other participant — paints the ticks blue. */
  seen?: boolean
}

export default function SharedPostMessage({
  preview,
  caption,
  isMine,
  showTime,
  timeLabel,
  pending,
  failed,
  seen,
}: SharedPostMessageProps) {
  const rowClass = `${styles.row} ${isMine ? styles.rowMine : styles.rowTheirs}`

  const timeNode = showTime ? (
    <span className={styles.time}>
      {timeLabel}
      {isMine && (
        <Icon
          icon={
            pending
              ? "mdi:clock-outline"
              : failed
              ? "mdi:alert-circle-outline"
              : "mdi:check-all"
          }
          width={11}
          height={11}
          className={
            failed
              ? styles.failIcon
              : seen && !pending
              ? styles.seenIcon
              : ""
          }
        />
      )}
    </span>
  ) : null

  const captionNode =
    caption && caption.trim() ? (
      <span className={`${styles.caption} ${isMine ? styles.captionMine : ""}`}>
        {caption}
      </span>
    ) : null

  // ── Unavailable: deleted or no longer visible to the viewer ──
  if (!preview || preview.unavailable) {
    return (
      <div className={rowClass}>
        <div className={styles.column}>
          <div className={`${styles.card} ${styles.cardUnavailable}`}>
            <Icon
              icon="mdi:image-off-outline"
              width={20}
              height={20}
              className={styles.unavailableIcon}
            />
            <span className={styles.unavailableText}>Post unavailable</span>
          </div>
          {captionNode}
          {timeNode}
        </div>
      </div>
    )
  }

  const hasMedia = preview.media_count > 0 && Boolean(preview.thumbnail_url)
  const isMulti = preview.media_count > 1
  const postText = preview.text?.trim()

  // The post detail route is `/posts/:id` (what Copy Link uses). Deliberately
  // NOT useNavigation().toPost — that returns the singular `/post/:id`, a known
  // latent 404; and there is no org-admin post-detail route to preserve.
  const href = `/posts/${preview.id}`

  return (
    <div className={rowClass}>
      <div className={styles.column}>
        <Link
          href={href}
          className={`${styles.card} ${styles.cardLink} ${
            pending ? styles.cardPending : ""
          }`}
        >
          {/* Author row */}
          <div className={styles.authorRow}>
            <Avatar
              src={preview.author.avatar}
              initials={preview.author.name?.slice(0, 2).toUpperCase()}
              size="xs"
            />
            <span className={styles.authorName}>{preview.author.name}</span>
          </div>

          {hasMedia ? (
            <>
              {/* Media thumbnail */}
              <div className={styles.thumbWrap}>
                <img
                  src={preview.thumbnail_url}
                  alt=""
                  className={styles.thumb}
                  loading="lazy"
                />
                {isMulti && (
                  <span className={styles.multiBadge} aria-label="Multiple items">
                    <Icon icon="mdi:layers-triple" width={14} height={14} />
                  </span>
                )}
              </div>
              {/* Post caption snippet */}
              {postText && (
                <span className={styles.postSnippet}>{postText}</span>
              )}
            </>
          ) : (
            /* Text-only post — quoted body */
            <div className={styles.quote}>
              <span className={styles.quoteText}>{postText || "View post"}</span>
            </div>
          )}
        </Link>

        {captionNode}
        {timeNode}
      </div>
    </div>
  )
}
