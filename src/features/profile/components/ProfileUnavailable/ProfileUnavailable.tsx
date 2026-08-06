"use client"

/**
 * What a logged-out visitor sees when a profile URL has no public view.
 *
 * Deliberately says nothing about WHY. Hidden, deactivated, usernameless and
 * nonexistent all land here with identical copy — the same rule the backend
 * follows by returning one 404 for all four. Naming the reason would confirm
 * that a hidden profile exists, which is exactly what its owner turned the
 * toggle off to prevent.
 *
 * Rendered instead of Next's notFound() so the route never hard-404s: a
 * SIGNED-IN visitor is entitled to that profile even when the public view is
 * off, and the server cannot tell the two apart without opting the page out of
 * ISR. The client can, so the client decides — see PublicProfileView.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import { authUrlWithNext } from "@/shared/services/authRedirect"
import styles from "./ProfileUnavailable.module.css"

export default function ProfileUnavailable({
  nextPath,
}: {
  /** Where to return after signing in — this profile, in case it's private. */
  nextPath: string
}) {
  return (
    <div className={styles.panel}>
      <span className={styles.mark} aria-hidden="true">
        <Icon icon="mdi:account-off-outline" width={30} height={30} />
      </span>

      <h1 className={styles.title}>This profile isn&apos;t available</h1>
      <p className={styles.message}>
        The link may be wrong, or the profile may not be public. If you have a
        Goatza account, sign in — you may still be able to see it.
      </p>

      <div className={styles.actions}>
        <Link
          href={authUrlWithNext(nextPath, "login")}
          className={styles.primaryBtn}
        >
          Log in
        </Link>
        <Link href="/" className={styles.secondaryBtn}>
          Go to Goatza
        </Link>
      </div>
    </div>
  )
}
