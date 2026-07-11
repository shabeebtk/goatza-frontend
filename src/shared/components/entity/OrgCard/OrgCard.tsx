"use client"

import Link from "next/link"
import clsx from "clsx"
import { Icon } from "@iconify/react"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./OrgCard.module.css"

/** Minimal, feature-agnostic data contract (see UserCardData). */
export interface OrgCardData {
  username: string
  name: string
  headline?: string
  logo?: string
  is_verified?: boolean
}

interface OrgCardProps {
  org: OrgCardData
  /** Optional action rendered beneath the body — e.g. a follow button. */
  action?: React.ReactNode
  /** Optional line under the headline — e.g. "city · 3.2 km" in the listing. */
  meta?: React.ReactNode
  /** Merged onto the root so consumers (e.g. the vertical grid) can resize it. */
  className?: string
}

export default function OrgCard({ org, action, meta, className }: OrgCardProps) {
  const { toProfile } = useNavigation()

  return (
    <div className={clsx(styles.card, className)}>
      <Link href={toProfile(org.username, "organization")} className={styles.body}>
        <span className={styles.logoWrap}>
          {org.logo ? (
            <img src={org.logo} alt={`${org.name} logo`} className={styles.logo} />
          ) : (
            <span className={styles.logoFallback}>
              {org.name?.slice(0, 2).toUpperCase()}
            </span>
          )}
        </span>

        <span className={styles.nameRow}>
          <span className={styles.name}>{org.name}</span>
          {org.is_verified && (
            <Icon
              icon="mdi:check-decagram"
              width={15}
              height={15}
              className={styles.verified}
              aria-label="Verified"
            />
          )}
        </span>

        {org.headline && <p className={styles.headline}>{org.headline}</p>}

        {meta && <span className={styles.meta}>{meta}</span>}
      </Link>

      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
