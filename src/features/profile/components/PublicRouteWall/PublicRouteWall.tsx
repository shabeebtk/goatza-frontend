"use client"

/**
 * A full-page login wall for routes that live in the public group but whose
 * CONTENT is not public.
 *
 * The follower graph is the case this exists for. `/profile/x/network` had to
 * move here with the rest of the profile subtree — splitting one feature across
 * two route groups would mean two layouts and two sets of chrome for the same
 * page — so the gate is inside the component instead. A follower list is the
 * highest-value thing to scrape off a social product; the counts are public,
 * the graph is not.
 *
 * A signed-in visitor renders `children` untouched.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import { authUrlWithNext } from "@/shared/services/authRedirect"
import { useAuthStore } from "@/store/auth.store"
import styles from "./PublicRouteWall.module.css"

export default function PublicRouteWall({
  title,
  message,
  nextPath,
  children,
}: {
  title: string
  message: string
  /** Where to return after signing in — usually the current path. */
  nextPath: string
  children: React.ReactNode
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  // PublicShell above is already showing a skeleton; a second one reads as a
  // broken page.
  if (isLoading) return null

  if (isAuthenticated) return <>{children}</>

  return (
    <div className={styles.wall}>
      <span className={styles.mark} aria-hidden="true">
        <Icon icon="mdi:account-group-outline" width={30} height={30} />
      </span>

      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>

      <div className={styles.actions}>
        <Link
          href={authUrlWithNext(nextPath, "signup")}
          className={styles.primaryBtn}
        >
          Sign up
        </Link>
        <Link
          href={authUrlWithNext(nextPath, "login")}
          className={styles.secondaryBtn}
        >
          Log in
        </Link>
      </div>
    </div>
  )
}
