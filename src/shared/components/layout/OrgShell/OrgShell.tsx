"use client"

import NotificationsSocket from "@/core/ws/NotificationsSocket"
import { useOrgMembershipEvents } from "@/features/orgMembers/hooks/useOrgMembershipEvents"
import UploadQueueBar from "@/shared/components/ui/UploadQueueBar/UploadQueueBar"
import UploadScreen from "@/shared/components/ui/UploadScreen/UploadScreen"
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
  // The person being removed from this very org, or their role changing.
  useOrgMembershipEvents()

  return (
    <div className={styles.shell}>
      <NotificationsSocket />
      <OrgNav orgId={orgId} />
      <UploadQueueBar />
      <UploadScreen />
      <main className={styles.content}>{children}</main>
    </div>
  )
}