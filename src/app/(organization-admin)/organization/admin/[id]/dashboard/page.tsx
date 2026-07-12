"use client"

import { Icon } from "@iconify/react"
import styles from "./page.module.css"

// Sample placeholder — real dashboard content comes later.
export default function OrganizationDashboardPage() {
  return (
    <div className={styles.page}>
      <div className={styles.placeholder}>
        <span className={styles.iconWrap}>
          <Icon icon="mdi:view-dashboard-outline" width={34} height={34} />
        </span>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>
          Your organization overview and insights will live here. Coming soon.
        </p>
      </div>
    </div>
  )
}
