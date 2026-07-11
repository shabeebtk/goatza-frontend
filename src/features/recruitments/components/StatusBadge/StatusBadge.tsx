import { Icon } from "@iconify/react"
import { APPLICATION_STATUS_META } from "../../applicationStatus"
import type { ApplicationStatus } from "../../services/recruitments.api"
import styles from "./StatusBadge.module.css"

// Small status pill reused by the applicants list rows + detail drawer.
export default function StatusBadge({ status }: { status: ApplicationStatus }) {
  const meta = APPLICATION_STATUS_META[status] ?? APPLICATION_STATUS_META.applied
  return (
    <span className={`${styles.badge} ${styles[meta.colorClass]}`}>
      <Icon icon={meta.icon} width={12} height={12} />
      {meta.label}
    </span>
  )
}
