"use client"

import Link from "next/link"
import dayjs from "dayjs"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import type { SharedRecruitmentPreview } from "../../services/conversations.api"
import styles from "./SharedRecruitmentMessage.module.css"

// recruitment_type → short chip label. Mirrors TYPE_META elsewhere but kept
// local + tiny; the chat card only needs the label.
const TYPE_LABEL: Record<string, string> = {
  open_trial: "Open Trial",
  player_looking: "Player Looking",
  direct_recruitment: "Direct Recruitment",
  scholarship: "Scholarship",
}

// Statuses that mute the card and show a tag. `active` renders normally.
const CLOSED_TAG: Record<string, string> = {
  closed: "Closed",
  cancelled: "Cancelled",
  draft: "Draft",
}

function deadlineLine(deadline: string | null, isClosed: boolean): string | null {
  if (!deadline) return null
  const d = dayjs(deadline)
  if (!d.isValid()) return null
  if (isClosed || d.isBefore(dayjs())) return `Closed · ${d.format("D MMM")}`
  return `Apply by ${d.format("D MMM")}`
}

interface SharedRecruitmentMessageProps {
  preview: SharedRecruitmentPreview | null | undefined
  /** Optional caption (message.content) shown under the card, Instagram-style. */
  caption?: string
  isMine: boolean
  showTime: boolean
  timeLabel: string
  pending?: boolean
  failed?: boolean
  /** Read by the other participant — paints the ticks blue. */
  seen?: boolean
}

export default function SharedRecruitmentMessage({
  preview,
  caption,
  isMine,
  showTime,
  timeLabel,
  pending,
  failed,
  seen,
}: SharedRecruitmentMessageProps) {
  const { toRecruitment } = useNavigation()

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
              icon="mdi:bullhorn-variant-outline"
              width={20}
              height={20}
              className={styles.unavailableIcon}
            />
            <span className={styles.unavailableText}>
              This recruitment is no longer available
            </span>
          </div>
          {captionNode}
          {timeNode}
        </div>
      </div>
    )
  }

  const isClosed = preview.status !== "active"
  const typeLabel = TYPE_LABEL[preview.type] ?? preview.type
  const closedTag = CLOSED_TAG[preview.status]
  const deadline = deadlineLine(preview.deadline, isClosed)

  return (
    <div className={rowClass}>
      <div className={styles.column}>
        <Link
          href={toRecruitment(preview.id)}
          className={`${styles.card} ${styles.cardLink} ${
            isClosed ? styles.cardMuted : ""
          } ${pending ? styles.cardPending : ""}`}
        >
          {/* Cover / sport placeholder */}
          <div className={styles.cover}>
            {preview.cover_url ? (
              <img
                src={preview.cover_url}
                alt=""
                className={styles.coverImg}
                loading="lazy"
              />
            ) : (
              <div className={styles.coverPlaceholder}>
                <Icon icon="mdi:trophy-outline" width={30} height={30} />
              </div>
            )}
            {closedTag && <span className={styles.statusTag}>{closedTag}</span>}
          </div>

          {/* Body */}
          <div className={styles.body}>
            <div className={styles.orgRow}>
              <Avatar
                src={preview.org.avatar}
                initials={preview.org.name?.slice(0, 2).toUpperCase()}
                size="xs"
              />
              <span className={styles.orgName}>{preview.org.name}</span>
            </div>

            <span className={styles.title}>{preview.title}</span>

            <div className={styles.chipRow}>
              {preview.sport && (
                <span className={styles.chip}>{preview.sport}</span>
              )}
              {typeLabel && (
                <span className={`${styles.chip} ${styles.chipType}`}>
                  {typeLabel}
                </span>
              )}
            </div>

            {deadline && (
              <span
                className={`${styles.deadline} ${
                  isClosed ? styles.deadlineClosed : ""
                }`}
              >
                <Icon icon="mdi:calendar-clock-outline" width={12} height={12} />
                {deadline}
              </span>
            )}
          </div>
        </Link>

        {captionNode}
        {timeNode}
      </div>
    </div>
  )
}
