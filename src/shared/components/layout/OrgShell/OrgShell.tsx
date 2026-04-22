"use client"

import OrgNav from "../OrgNav/OrgNav"
import styles from "./OrgShell.module.css"

interface OrgShellProps {
  children: React.ReactNode
  orgId: string
}

export default function OrgShell({ children, orgId }: OrgShellProps) {
  return (
    <div className={styles.shell}>
      <OrgNav orgId={orgId} />
      <main className={styles.content}>{children}</main>
    </div>
  )
}