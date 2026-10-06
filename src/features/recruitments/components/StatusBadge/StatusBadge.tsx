import { Icon } from "@iconify/react"
import { playerStatusMeta, statusMeta } from "../../applicationStatus"
import type {
  ApplicationStatus,
  RecruitmentTypeValue,
} from "../../services/recruitments.api"
import styles from "./StatusBadge.module.css"

// Small status pill reused by the applicants list rows + detail drawer, and by
// the player's own application surfaces with `audience="player"` — which reads
// `shortlisted` as "Under review", because the org's shortlist is private.
export default function StatusBadge({
  status,
  recruitmentType,
  audience = "org",
}: {
  status: ApplicationStatus
  /** Picks the per-type wording of `trial_confirmed`. */
  recruitmentType?: RecruitmentTypeValue
  audience?: "org" | "player"
}) {
  const meta =
    audience === "player"
      ? playerStatusMeta(status, recruitmentType)
      : statusMeta(status, recruitmentType)
  return (
    <span className={`${styles.badge} ${styles[meta.colorClass]}`}>
      <Icon icon={meta.icon} width={12} height={12} />
      {meta.label}
    </span>
  )
}
