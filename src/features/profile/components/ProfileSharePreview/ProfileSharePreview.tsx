"use client"

/**
 * Compact "what you're sharing" chip rendered at the top of the ShareSheet for
 * a profile. Presentational + prop-driven, mirroring PostSharePreview and
 * RecruitmentSharePreview so the three read as one component family.
 */

import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import styles from "./ProfileSharePreview.module.css"

interface ProfileSharePreviewProps {
  name: string
  username: string
  avatarUrl?: string
  /** Headline, or a sport/level line — whatever identifies them at a glance. */
  subtitle?: string
  kind: "user" | "organization"
  isVerified?: boolean
}

export default function ProfileSharePreview({
  name,
  username,
  avatarUrl,
  subtitle,
  kind,
  isVerified,
}: ProfileSharePreviewProps) {
  return (
    <div className={styles.card}>
      <Avatar
        src={avatarUrl || undefined}
        initials={(name || username).slice(0, 2).toUpperCase()}
        size="md"
        className={styles.avatar}
      />

      <div className={styles.body}>
        <span className={styles.kicker}>
          <Icon
            icon={
              kind === "organization"
                ? "mdi:office-building-outline"
                : "mdi:account-outline"
            }
            width={12}
            height={12}
          />
          {kind === "organization" ? "Organization" : "Profile"}
        </span>

        <span className={styles.name}>
          {name}
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

        <span className={styles.handle}>@{username}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
    </div>
  )
}
