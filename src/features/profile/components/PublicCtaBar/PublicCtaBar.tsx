"use client"

/**
 * The sticky sign-up bar an anonymous visitor sees at the bottom of a public
 * profile. Sits where the bottom tab bar sits for a signed-in user, so the
 * page's reserved bottom padding is already correct for it.
 */

import Link from "next/link"
import { Icon } from "@iconify/react"

import { authUrlWithNext } from "@/shared/services/authRedirect"
import styles from "./PublicCtaBar.module.css"

export default function PublicCtaBar({
  displayName,
  nextPath,
}: {
  displayName: string
  nextPath: string
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.copy}>
          <Icon icon="mdi:soccer" width={16} height={16} aria-hidden="true" />
          See {displayName}&apos;s full profile on Goatza
        </span>
        <Link
          href={authUrlWithNext(nextPath, "signup")}
          className={styles.cta}
        >
          Sign up
        </Link>
      </div>
    </div>
  )
}
