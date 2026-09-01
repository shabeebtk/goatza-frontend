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

import { Suspense } from "react"
import { usePathname } from "next/navigation"

import ActorRouteSync from "@/shared/components/auth/ActorRouteSync"
import AppShell from "@/shared/components/layout/AppShell/AppShell"
import PublicNav from "@/shared/components/layout/PublicNav/PublicNav"
import ThemeColorMeta from "@/shared/components/ThemeColorMeta/ThemeColorMeta"
import { useMarkAppEntry } from "@/shared/hooks/useSmartBack"
import { useAuthStore } from "@/store/auth.store"
import styles from "./PublicShell.module.css"

/**
 * The profile shape: nav band → cover → avatar overlapping it → name, chips,
 * stats, buttons.
 *
 * Everything below the nav sits in the SAME 760px centred column the real
 * profile card uses. It used to be full-bleed, which on a desktop meant a
 * banner three times the width of the page that replaced it — the swap read as
 * the layout collapsing rather than as content arriving. The nav band stays
 * full width because the real one is fixed and does span the viewport.
 */
function ProfileSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonNav} />

      <div className={styles.skeletonPage}>
        <div className={styles.skeletonCard}>
          <div className={styles.skeletonCover} />

          <div className={styles.skeletonBody}>
            <div className={styles.skeletonAvatar} />
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLineSm} />

            <div className={styles.skeletonRow}>
              <span className={styles.skeletonChip} />
              <span className={styles.skeletonChip} />
              <span className={styles.skeletonChip} />
            </div>

            <div className={styles.skeletonRow}>
              <span className={styles.skeletonStat} />
              <span className={styles.skeletonStat} />
              <span className={styles.skeletonStat} />
            </div>

            <div className={styles.skeletonRow}>
              <span className={styles.skeletonBtn} />
              <span className={styles.skeletonBtn} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The CV shape: no cover, a photo beside the name, then the fact grid, the
 * action row and two sections.
 *
 * A separate shape rather than reusing the profile one because the difference
 * is the first thing on the page — a full-width banner that then vanishes is a
 * worse wait than no banner at all.
 */
function CVSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonNav} />

      <div className={styles.skeletonSheet}>
        <div className={styles.skeletonCvHeader}>
          <div className={styles.skeletonCvPhoto} />
          <div className={styles.skeletonCvHeaderText}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLineSm} />
            <div className={styles.skeletonRow}>
              <span className={styles.skeletonChip} />
              <span className={styles.skeletonChip} />
            </div>
          </div>
        </div>

        <div className={styles.skeletonBox} />

        <div className={styles.skeletonRow}>
          <span className={styles.skeletonBtn} />
          <span className={styles.skeletonBtn} />
        </div>

        <div className={styles.skeletonSection} />
        <div className={styles.skeletonSection} />
      </div>
    </div>
  )
}

/**
 * Routes whose CONTENT must be on screen before the auth store resolves.
 *
 * The skeleton branch below is right for a profile — the page has nothing to
 * show until it knows who is asking. It is wrong for a legal document, which
 * is the same text for everybody and must be readable with JavaScript turned
 * off entirely. `isLoading` starts true on every load, so the skeleton is what
 * lands in the server-rendered HTML: leaving these routes in it would ship a
 * /terms that shows a profile skeleton to crawlers and to anyone without JS,
 * which defeats the point of the pages being public and indexable.
 */
const CONTENT_FIRST_ROUTES = [
  "/terms",
  "/privacy",
  "/guidelines",
  "/safety",
  /**
   * The logged-out bug report. Here for a sharper version of the same reason:
   * the people who reach it are the ones whose app is already misbehaving, and
   * a profile skeleton on the way to a form — or worse, a skeleton that never
   * resolves because the thing that broke is the session bootstrap — is the
   * page failing in exactly the situation it exists for.
   */
  "/report-problem",
]

function isContentFirst(pathname: string | null): boolean {
  return CONTENT_FIRST_ROUTES.includes(pathname ?? "")
}

export default function PublicShell({
  children,
}: {
  children: React.ReactNode
}) {
  useMarkAppEntry()

  const pathname = usePathname()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading && isContentFirst(pathname)) {
    // The anonymous chrome, with the document already in it. A signed-in
    // reader gets the nav swapped for AppShell a moment later; the text under
    // it never moves, which is the half that matters.
    //
    // THE SUSPENSE BOUNDARY IS LOAD-BEARING. PublicNav calls useSearchParams,
    // and on a statically prerendered route that bails the WHOLE page out to
    // client-side rendering — the built HTML becomes a spinner and the
    // document only appears once JS runs. Wrapping the nav keeps the bailout
    // inside this boundary, so the prerender still contains the text. Verified
    // by the build: /terms, /privacy, /guidelines and /safety are all ○ Static
    // and their HTML carries the document.
    return (
      <>
        <ThemeColorMeta />
        <div className={styles.publicShell}>
          <Suspense fallback={<div className={styles.navFallback} />}>
            <PublicNav />
          </Suspense>
          <main className={styles.content}>{children}</main>
        </div>
      </>
    )
  }

  if (isLoading) {
    // The two public shapes are different enough that one skeleton cannot
    // stand in for both. The path is the only thing known this early — the
    // page component has not rendered yet.
    const isCV = pathname?.startsWith("/cv/") ?? false

    return (
      <>
        <ThemeColorMeta />
        {isCV ? <CVSkeleton /> : <ProfileSkeleton />}
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
