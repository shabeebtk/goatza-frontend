"use client"

import { Icon } from "@iconify/react"
import Link from "next/link"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { OrganizationMini } from "../../types"
import styles from "./CreateLimitState.module.css"

/**
 * In place of the form when this person already has as many pages as they
 * may create. Their pages are listed the way the account switcher lists them,
 * and opening one switches to it the same way.
 */
export default function CreateLimitState({
  limit,
  organizations,
  onOpen,
}: {
  limit: number
  organizations: OrganizationMini[]
  onOpen: (organizationId: string) => void
}) {
  return (
    <section className={styles.state} aria-labelledby="org-create-limit-heading">
      <span className={styles.icon} aria-hidden="true">
        <Icon icon="mdi:flag-checkered" width={28} height={28} />
      </span>
      <h2 id="org-create-limit-heading" className={styles.heading}>
        You&apos;ve reached the limit of {limit} pages
      </h2>
      <p className={styles.text}>
        Each account can create up to {limit} pages. Open one of yours to keep building it.
      </p>

      {organizations.length > 0 && (
        <ul className={styles.list} aria-label="Your pages">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <button
                type="button"
                className={styles.row}
                onClick={() => onOpen(organization.id)}
              >
                <Avatar
                  src={organization.logo}
                  initials={organization.name?.slice(0, 2).toUpperCase()}
                  size="sm"
                />
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{organization.name}</span>
                  <span className={styles.rowSub}>@{organization.username}</span>
                </span>
                <Icon icon="mdi:chevron-right" width={20} height={20} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link href="/home" className={styles.home}>
        Back to home
      </Link>
    </section>
  )
}
