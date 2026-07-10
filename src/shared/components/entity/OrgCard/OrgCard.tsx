"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./OrgCard.module.css"

/** Minimal, feature-agnostic data contract (see UserCardData). */
export interface OrgCardData {
  username: string
  name: string
  type?: string
  level?: string
  headline?: string
  logo?: string
  is_verified?: boolean
}

const LEVEL_LABELS: Record<string, string> = {
  amateur: "Amateur",
  semi_professional: "Semi-Pro",
  professional: "Professional",
  youth: "Youth",
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function typeLevelLine(type?: string, level?: string): string {
  const parts: string[] = []
  if (type) parts.push(cap(type))
  if (level) parts.push(LEVEL_LABELS[level] ?? cap(level))
  return parts.join(" · ")
}

interface OrgCardProps {
  org: OrgCardData
}

export default function OrgCard({ org }: OrgCardProps) {
  const { toProfile } = useNavigation()
  const meta = typeLevelLine(org.type, org.level)

  return (
    <Link href={toProfile(org.username, "organization")} className={styles.card}>
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

      {meta && <span className={styles.meta}>{meta}</span>}

      {org.headline && <p className={styles.headline}>{org.headline}</p>}
    </Link>
  )
}
