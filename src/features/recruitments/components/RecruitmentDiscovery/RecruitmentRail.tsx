"use client"

/**
 * One discover section (§5) — a horizontally scrollable rail of cards under a
 * heading, with a "See all" that opens the "All" tab with this rail's own rule
 * pre-applied.
 *
 * Renders nothing when empty. A heading over a blank strip reads as a broken
 * page, and the sections genuinely are empty for a lot of players at launch.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import type { Recruitment } from "../../services/recruitments.api"
import styles from "./RecruitmentRail.module.css"

interface RecruitmentRailProps {
  title: string
  subtitle?: string
  icon: string
  items: Recruitment[]
  /** Href into the "All" tab, filters already applied. */
  seeAllHref: string
}

export default function RecruitmentRail({
  title,
  subtitle,
  icon,
  items,
  seeAllHref,
}: RecruitmentRailProps) {
  if (items.length === 0) return null

  return (
    <section className={styles.rail} aria-label={title}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true">
            <Icon icon={icon} width={16} height={16} />
          </span>
          <div className={styles.headingText}>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>

        <Link href={seeAllHref} className={styles.seeAll} scroll={false}>
          See all
          <Icon icon="mdi:arrow-right" width={14} height={14} />
        </Link>
      </header>

      {/* Overflow scrolls inside the rail, never the page. */}
      <div className={styles.track}>
        {items.map((item) => (
          <div key={item.id} className={styles.slide}>
            <RecruitmentCard recruitment={item} />
          </div>
        ))}
      </div>
    </section>
  )
}
