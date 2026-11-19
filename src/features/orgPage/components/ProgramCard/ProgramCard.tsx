"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import {
  PROGRAM_LEVEL_LABELS,
  formatAges,
  formatBranch,
  formatDays,
  formatFee,
  formatTimeRange,
} from "../../format"
import type { ProgramFee, ProgramLevel, ProgramSpots, WeekDay } from "../../types"
import styles from "./ProgramCard.module.css"

/** What the card draws: a saved Program, or the editor's values before saving. */
export type ProgramCardData = {
  name: string
  age_min: number | null
  age_max: number | null
  level: ProgramLevel
  level_label?: string
  days: WeekDay[]
  start_time: string
  end_time: string
  location: { name: string; city: string } | null
  fee: Pick<ProgramFee, "mode" | "amount" | "per">
  free_trial: boolean
  spots: ProgramSpots
}

/**
 * One program as a visitor reads it. Presentational only, with no data fetching:
 * the club's list, the editor's live preview and (Phase 3) the public page all
 * draw it. Anything the club does to it goes in `actions`.
 */
export default function ProgramCard({
  program,
  actions,
  className,
}: {
  program: ProgramCardData
  actions?: ReactNode
  className?: string
}) {
  const level = program.level_label || PROGRAM_LEVEL_LABELS[program.level] || ""
  const who = [formatAges(program.age_min, program.age_max), level].filter(Boolean).join(" · ")
  const when = [formatDays(program.days), formatTimeRange(program.start_time, program.end_time)]
    .filter(Boolean)
    .join(" · ")
  const branch = formatBranch(program.location)

  return (
    <article className={`${styles.card} ${className ?? ""}`}>
      <div className={styles.top}>
        <h3 className={styles.name}>{program.name.trim() || "Untitled program"}</h3>
        {(program.free_trial || program.spots !== "open") && (
          <div className={styles.badges}>
            {program.free_trial && <span className={`${styles.badge} ${styles.trial}`}>Free trial</span>}
            {program.spots === "few" && (
              <span className={`${styles.badge} ${styles.few}`}>Few spots left</span>
            )}
            {program.spots === "full" && <span className={`${styles.badge} ${styles.full}`}>Full</span>}
          </div>
        )}
      </div>

      <ul className={styles.lines}>
        {who && (
          <li className={styles.line}>
            <Icon icon="mdi:account-group-outline" width={16} height={16} aria-hidden="true" />
            <span>{who}</span>
          </li>
        )}
        {when && (
          <li className={styles.line}>
            <Icon icon="mdi:calendar-clock-outline" width={16} height={16} aria-hidden="true" />
            <span>{when}</span>
          </li>
        )}
        {branch && (
          <li className={styles.line}>
            <Icon icon="mdi:map-marker-outline" width={16} height={16} aria-hidden="true" />
            <span>{branch}</span>
          </li>
        )}
      </ul>

      <p className={styles.fee}>{formatFee(program.fee)}</p>

      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  )
}
