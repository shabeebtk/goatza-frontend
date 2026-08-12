"use client"

import AppNav from "@/shared/components/layout/AppNav/AppNav"
import { useFcmNotifications } from "@/shared/hooks/useFcmNotifications"
import styles from "./AppShell.module.css"

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  // Shared with OrgShell — see the hook for why it lives outside this file.
  useFcmNotifications()

  return (
    <div className={styles.shell}>
      <AppNav />
      <main className={styles.content}>{children}</main>
    </div>
  )
}
