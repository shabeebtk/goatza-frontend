"use client"

import NotificationsSocket from "@/core/ws/NotificationsSocket"
import UploadQueueBar from "@/shared/components/ui/UploadQueueBar/UploadQueueBar"
import { useFcmNotifications } from "@/shared/hooks/useFcmNotifications"
import { usePrefetchMediaCapabilities } from "@/shared/services/mediaCapabilities"
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
  // Same as AppShell, for the same reasons.
  usePrefetchMediaCapabilities()

  return (
    <div className={styles.shell}>
      <NotificationsSocket />
      <OrgNav orgId={orgId} />
      <UploadQueueBar />
      <main className={styles.content}>{children}</main>
    </div>
  )
}