"use client"

/**
 * SettingsPage — the account menu.
 *
 * Deliberately a list of sections of rows rather than bespoke blocks: every
 * new setting is one <SettingsRow> in the right section, and a section that
 * has no rows yet renders nothing at all.
 */

import { Children, type ReactNode } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { BackHeader } from "@/shared/components/ui"
import { useLogout } from "@/features/auth/hooks/useLogout"
import styles from "./SettingsPage.module.css"

// ── Building blocks ──────────────────────────────────────────

function SettingsSection({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  // An empty section is invisible — no header floating above a gap while the
  // rows that belong under it don't exist yet.
  if (Children.toArray(children).length === 0) return null

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.rows}>{children}</div>
    </section>
  )
}

function SettingsRow({
  href,
  icon,
  label,
}: {
  href: string
  icon: string
  label: string
}) {
  return (
    <Link href={href} className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        <Icon icon={icon} width={20} height={20} />
      </span>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowChevron} aria-hidden="true">
        <Icon icon="mdi:chevron-right" width={20} height={20} />
      </span>
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const logout = useLogout()

  return (
    <div className={styles.page}>
      <BackHeader title="Settings" fallback="/home" />

      <SettingsSection title="Account">
        <SettingsRow
          href="/settings/password"
          icon="mdi:lock-outline"
          label="Change password"
        />
      </SettingsSection>

      <SettingsSection title="Content">
        {/* SETTINGS_CONTENT_ROWS — Saved posts row is added by a later task */}
        <SettingsRow
          href="/settings/mentions"
          icon="mdi:at"
          label="Mentions"
        />
      </SettingsSection>

      <div className={styles.rows}>
        <button type="button" className={styles.logoutRow} onClick={logout}>
          <span className={styles.rowIcon} aria-hidden="true">
            <Icon icon="mdi:logout" width={20} height={20} />
          </span>
          <span className={styles.rowLabel}>Log out</span>
        </button>
      </div>
    </div>
  )
}
