"use client"

import Link from "next/link"
import { Icon } from "@iconify/react"

import { useAuthStore } from "@/store/auth.store"
import styles from "./UnavailableState.module.css"

/**
 * What a link to something gone opens: a notification for a deleted post, a
 * shared recruitment since taken down, a profile that left. Nothing has gone
 * wrong, so it is not an error page, and it never says why: "deleted", "private"
 * and "blocked" must read the same, or the difference is a leak.
 */
export default function UnavailableState({
  icon = "mdi:compass-off-outline",
}: {
  icon?: string
}) {
  const isOrgAdminView = useAuthStore((s) => s.isOrgAdminView)
  const actorId = useAuthStore((s) => s.actorId)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const home =
    isOrgAdminView && actorId
      ? `/organization/admin/${actorId}/dashboard`
      : isAuthenticated
        ? "/home"
        : "/"

  return (
    <div className={styles.state}>
      <Icon icon={icon} width={40} height={40} className={styles.icon} aria-hidden="true" />
      <p className={styles.title}>This isn&apos;t available any more</p>
      <Link href={home} className={styles.link}>
        Go home
      </Link>
    </div>
  )
}

/**
 * The refusals that mean "not for you, or not there", rather than "try again".
 * A 500 or a dropped connection keeps its own error state: that one IS worth a
 * retry, and calling it gone would be a lie.
 */
export function isUnavailableError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 403 || status === 404 || status === 410
}
