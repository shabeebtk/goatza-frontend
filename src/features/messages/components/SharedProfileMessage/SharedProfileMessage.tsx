"use client"

/**
 * A forwarded profile card in a chat.
 *
 * ONE component for both kinds. A person's card and a club's card differ in a
 * couple of fields (sport + position vs type + level, a verified tick) and in
 * nothing else — two components would be the same file twice, and the row /
 * caption / time / unavailable machinery below is exactly what SharedPostMessage
 * and SharedRecruitmentMessage already do.
 *
 * Navigation goes through useNavigation().toProfile so a tap resolves correctly
 * inside the org-admin route space instead of bouncing the actor back to their
 * personal account.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import { getRoleLabel } from "@/shared/constants/roles"
import type {
  SharedOrgProfilePreview,
  SharedUserProfilePreview,
} from "../../services/conversations.api"
import styles from "./SharedProfileMessage.module.css"

// Org type / level → chip label. Kept local + tiny, like the recruitment card's
// TYPE_LABEL: the chat card only needs the label.
const ORG_TYPE_LABEL: Record<string, string> = {
  club: "Club",
  team: "Team",
  academy: "Academy",
  school: "School",
}

const ORG_LEVEL_LABEL: Record<string, string> = {
  amateur: "Amateur",
  semi_professional: "Semi-Pro",
  professional: "Professional",
  youth: "Youth",
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface SharedProfileMessageProps {
  kind: "user" | "organization"
  preview:
    | SharedUserProfilePreview
    | SharedOrgProfilePreview
    | null
    | undefined
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

export default function SharedProfileMessage({
  kind,
  preview,
  caption,
  isMine,
  showTime,
  timeLabel,
  pending,
  failed,
  seen,
}: SharedProfileMessageProps) {
  const { toProfile } = useNavigation()

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

  // ── Unavailable: deleted, deactivated, or no username ──
  if (!preview || preview.unavailable) {
    return (
      <div className={rowClass}>
        <div className={styles.column}>
          <div className={`${styles.card} ${styles.cardUnavailable}`}>
            <Icon
              icon="mdi:account-off-outline"
              width={20}
              height={20}
              className={styles.unavailableIcon}
            />
            <span className={styles.unavailableText}>Profile unavailable</span>
          </div>
          {captionNode}
          {timeNode}
        </div>
      </div>
    )
  }

  const isOrg = kind === "organization"

  const avatar = isOrg
    ? (preview as Extract<SharedOrgProfilePreview, { unavailable: false }>).logo
    : (preview as Extract<SharedUserProfilePreview, { unavailable: false }>)
        .avatar

  // Two chips, whichever pair identifies this kind of profile at a glance.
  const chips = isOrg
    ? (() => {
        const org = preview as Extract<
          SharedOrgProfilePreview,
          { unavailable: false }
        >
        return [
          ORG_TYPE_LABEL[org.type] ?? org.type,
          ORG_LEVEL_LABEL[org.level] ?? org.level,
        ].filter(Boolean)
      })()
    : (() => {
        const user = preview as Extract<
          SharedUserProfilePreview,
          { unavailable: false }
        >
        return [
          user.primary_sport,
          user.primary_position,
        ].filter(Boolean)
      })()

  // Sub-line: what they are and where. Falls back to the role/type alone so the
  // card is never a bare name.
  const subtitle = isOrg
    ? (preview as Extract<SharedOrgProfilePreview, { unavailable: false }>).city
    : (() => {
        const user = preview as Extract<
          SharedUserProfilePreview,
          { unavailable: false }
        >
        return (
          user.headline ||
          [getRoleLabel(user.role), user.city].filter(Boolean).join(" · ")
        )
      })()

  const isVerified =
    isOrg &&
    (preview as Extract<SharedOrgProfilePreview, { unavailable: false }>)
      .is_verified

  return (
    <div className={rowClass}>
      <div className={styles.column}>
        <Link
          href={toProfile(preview.username, isOrg ? "organization" : "user")}
          className={`${styles.card} ${styles.cardLink} ${
            pending ? styles.cardPending : ""
          }`}
        >
          <Avatar
            src={avatar || undefined}
            initials={(preview.name || preview.username)
              .slice(0, 2)
              .toUpperCase()}
            size="lg"
            className={styles.avatar}
          />

          <div className={styles.body}>
            <span className={styles.name}>
              {preview.name || preview.username}
              {isVerified && (
                <Icon
                  icon="mdi:check-decagram"
                  width={13}
                  height={13}
                  className={styles.verified}
                  aria-label="Verified"
                />
              )}
            </span>

            <span className={styles.handle}>@{preview.username}</span>

            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}

            {chips.length > 0 && (
              <div className={styles.chipRow}>
                {chips.map((chip) => (
                  <span key={chip} className={styles.chip}>
                    {chip}
                  </span>
                ))}
              </div>
            )}

            <span className={styles.followers}>
              {formatCount(preview.followers_count)} followers
            </span>
          </div>
        </Link>

        {captionNode}
        {timeNode}
      </div>
    </div>
  )
}
