"use client"

/**
 * Top bar for a logged-out visitor on a public profile.
 *
 * Three things and nothing else: the mark (which goes to the landing page, not
 * /home — there is no feed for them), Log in, Sign up. Every other affordance
 * on the page routes through the login wall, so duplicating them up here would
 * only add taps.
 *
 * The auth links carry ?next=<current path>, so signing up from a shared
 * profile lands back on that profile rather than the home feed.
 */

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { LOGO_URL } from "@/constants"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import styles from "./PublicNav.module.css"

export default function PublicNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // The query string matters: /profile/x/network?tab=following should come
  // back to that tab, not to the profile root.
  const query = searchParams.toString()
  const nextPath = query ? `${pathname}?${query}` : pathname

  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logoLink} aria-label="Goatza">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="" aria-hidden="true" className={styles.logoImg} />
          <span className={styles.wordmark}>Goatza</span>
        </Link>

        <nav className={styles.actions} aria-label="Account">
          <Link
            href={authUrlWithNext(nextPath, "login")}
            className={styles.loginBtn}
          >
            Log in
          </Link>
          <Link
            href={authUrlWithNext(nextPath, "signup")}
            className={styles.signupBtn}
          >
            Sign up
          </Link>
        </nav>
      </div>
    </header>
  )
}
