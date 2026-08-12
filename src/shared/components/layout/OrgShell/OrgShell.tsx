"use client"

import { useFcmNotifications } from "@/shared/hooks/useFcmNotifications"
import OrgNav from "../OrgNav/OrgNav"
import styles from "./OrgShell.module.css"

interface OrgShellProps {
  children: React.ReactNode
  orgId: string
}

export default function OrgShell({ children, orgId }: OrgShellProps) {
  // Same wiring AppShell runs. Without it an org admin got no foreground toast
  // at all — this shell replaces AppShell, it doesn't nest inside it.
  useFcmNotifications()

  return (
    <div className={styles.shell}>
      <OrgNav orgId={orgId} />
      <main className={styles.content}>{children}</main>
    </div>
  )
}