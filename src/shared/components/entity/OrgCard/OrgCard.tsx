"use client"

import Link from "next/link"
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
}

export default function OrgCard({ org, action }: OrgCardProps) {
  const { toProfile } = useNavigation()

  return (
    <div className={styles.card}>
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
      </Link>

      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
