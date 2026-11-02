"use client"

import NotificationsSocket from "@/core/ws/NotificationsSocket"
import AppNav from "@/shared/components/layout/AppNav/AppNav"
import UploadQueueBar from "@/shared/components/ui/UploadQueueBar/UploadQueueBar"
import { useFcmNotifications } from "@/shared/hooks/useFcmNotifications"
import { usePrefetchMediaCapabilities } from "@/shared/services/mediaCapabilities"
import styles from "./AppShell.module.css"

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  // Shared with OrgShell — see the hook for why it lives outside this file.
  useFcmNotifications()
  // Whether the server can convert what this browser cannot — asked once,
  // before anyone picks a file.
  usePrefetchMediaCapabilities()

  return (
    <div className={styles.shell}>
      {/* The one ws/notifications/ connection, and the background uploads it
          finishes. OrgShell mounts the same two; never both at once. */}
      <NotificationsSocket />
      <AppNav />
      <UploadQueueBar />
      <main className={styles.content}>{children}</main>
    </div>
  )
}
