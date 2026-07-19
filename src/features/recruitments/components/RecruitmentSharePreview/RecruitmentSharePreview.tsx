"use client"

import { Icon } from "@iconify/react"
import styles from "./RecruitmentSharePreview.module.css"

/**
 * Compact "what you're sharing" chip rendered at the top of the ShareSheet.
 *
 * Deliberately presentational and prop-driven (no data fetching) so both entry
 * points can feed it: the detail page has full media, list cards don't — when
 * `coverUrl` is absent it falls back to the sport icon.
 */
interface RecruitmentSharePreviewProps {
  title: string
  orgName: string
  sportName: string
  sportIcon?: string
  coverUrl?: string
}

export default function RecruitmentSharePreview({
  title,
  orgName,
  sportName,
  sportIcon,
  coverUrl,
}: RecruitmentSharePreviewProps) {
  return (
    <div className={styles.card}>
      <div className={styles.thumb}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className={styles.cover} loading="lazy" />
        ) : (
          <Icon
            icon={sportIcon || "mdi:trophy-outline"}
            width={22}
            height={22}
            className={styles.sportIcon}
          />
        )}
      </div>

      <div className={styles.body}>
        <span className={styles.kicker}>
          <Icon icon="mdi:bullhorn-variant-outline" width={12} height={12} />
          Recruitment
        </span>
        <span className={styles.title}>{title}</span>
        <span className={styles.meta}>
          {orgName}
          {sportName ? ` · ${sportName}` : ""}
        </span>
      </div>
    </div>
  )
}
