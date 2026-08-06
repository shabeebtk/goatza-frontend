"use client"

/**
 * Picks the chrome for a route that both signed-in users and strangers can
 * reach.
 *
 *   isLoading      → skeleton. Never the anonymous state: the auth store starts
 *                    empty on every load and only resolves after the session
 *                    bootstrap, so painting PublicNav first would flash "Log in
 *                    / Sign up" at someone who is already logged in.
 *   authenticated  → the existing AppShell + ActorRouteSync, byte-for-byte the
 *                    behaviour these pages had inside (autheticated).
 *   anonymous      → PublicNav plus a sticky sign-up bar.
 *
 * useMarkAppEntry runs in both branches, so the profile's back buttons know
 * whether going back would leave the app (see useSmartBack) exactly as they did
 * before the move.
 */

import ActorRouteSync from "@/shared/components/auth/ActorRouteSync"
import AppShell from "@/shared/components/layout/AppShell/AppShell"
import PublicNav from "@/shared/components/layout/PublicNav/PublicNav"
import ThemeColorMeta from "@/shared/components/ThemeColorMeta/ThemeColorMeta"
import { useMarkAppEntry } from "@/shared/hooks/useSmartBack"
import { useAuthStore } from "@/store/auth.store"
import styles from "./PublicShell.module.css"

function ShellSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonNav} />
      <div className={styles.skeletonCover} />
      <div className={styles.skeletonBody}>
        <div className={styles.skeletonAvatar} />
        <div className={styles.skeletonLine} />
        <div className={styles.skeletonLineSm} />
      </div>
    </div>
  )
}

export default function PublicShell({
  children,
}: {
  children: React.ReactNode
}) {
  useMarkAppEntry()

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <>
        <ThemeColorMeta />
        <ShellSkeleton />
      </>
    )
  }

  if (isAuthenticated) {
    return (
      <>
        <ThemeColorMeta />
        <AppShell>
          <ActorRouteSync />
          {children}
        </AppShell>
      </>
    )
  }

  return (
    <>
      <ThemeColorMeta />
      <div className={styles.publicShell}>
        <PublicNav />
        <main className={styles.content}>{children}</main>
      </div>
    </>
  )
}
