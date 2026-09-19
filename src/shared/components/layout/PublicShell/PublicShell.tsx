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

import ProfileSkeleton, {
  CVSkeleton,
} from "@/features/profile/components/ProfileSkeleton/ProfileSkeleton"
import ActorRouteSync from "@/shared/components/auth/ActorRouteSync"
import AppShell from "@/shared/components/layout/AppShell/AppShell"
import PublicNav from "@/shared/components/layout/PublicNav/PublicNav"
import ThemeColorMeta from "@/shared/components/ThemeColorMeta/ThemeColorMeta"
import { useMarkAppEntry } from "@/shared/hooks/useSmartBack"
import { useAuthStore } from "@/store/auth.store"
import styles from "./PublicShell.module.css"

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

/**
 * Same rule, for routes whose path carries an id.
 *
 * `/guardian/<token>` is the parent's consent page. The people who open it have
 * no session at all, so the auth bootstrap they would be waiting on can only
 * ever resolve to "anonymous" — and until it does, the branch below would hand
 * them a PROFILE SKELETON: a fake cover photo and a fake avatar, on a page a
 * stranger opened from an email about their child. It has to be content-first,
 * and it cannot be listed above because the token is part of the path.
 */
const CONTENT_FIRST_PREFIXES = ["/guardian/"]

function isContentFirst(pathname: string | null): boolean {
  const path = pathname ?? ""

  return (
    CONTENT_FIRST_ROUTES.includes(path) ||
    CONTENT_FIRST_PREFIXES.some((prefix) => path.startsWith(prefix))
  )
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
    //
    // `withNavBand`: this branch replaces the whole chrome, so the skeleton
    // has to draw the nav's band itself. The same components render WITHOUT
    // it one level down — the route's loading.tsx and UserProfile's fetch
    // both sit inside a real shell — so the silhouette is identical at every
    // stage and only the band gives way to the real nav.
    const isCV = pathname?.startsWith("/cv/") ?? false

    return (
      <>
        <ThemeColorMeta />
        {isCV ? <CVSkeleton withNavBand /> : <ProfileSkeleton withNavBand />}
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
