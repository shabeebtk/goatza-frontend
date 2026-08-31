"use client"

/**
 * The settings-menu building blocks: sections of icon + label + chevron rows.
 *
 * Shared by the personal settings page and the org-admin one so the two menus
 * are visually the same thing — an org admin shouldn't have to learn a second
 * layout to find their saved posts.
 */

import { Children, useId, type ReactNode } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import styles from "./SettingsMenu.module.css"

export function SettingsSection({
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

/**
 * A row that navigates.
 *
 * `description` is optional and reuses the toggle row's secondary line, so a
 * navigation row that needs a subtitle (the Legal rows print which version you
 * accepted) does not need a second row component to say it.
 */
export function SettingsRow({
  href,
  icon,
  label,
  description,
}: {
  href: string
  icon: string
  label: string
  description?: string
}) {
  return (
    <Link href={href} className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        <Icon icon={icon} width={20} height={20} />
      </span>

      {description ? (
        <span className={styles.rowToggleText}>
          <span className={styles.rowLabel}>{label}</span>
          <span className={styles.rowDescription}>{description}</span>
        </span>
      ) : (
        <span className={styles.rowLabel}>{label}</span>
      )}

      <span className={styles.rowChevron} aria-hidden="true">
        <Icon icon="mdi:chevron-right" width={20} height={20} />
      </span>
    </Link>
  )
}

/**
 * A row that DOES something rather than navigating, so it carries no chevron.
 * `destructive` is for the one-way actions (log out) — same treatment the post
 * options sheet gives delete.
 */
export function SettingsActionRow({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: string
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <div className={styles.rows}>
      <button
        type="button"
        className={`${styles.row} ${destructive ? styles.rowDestructive : ""}`}
        onClick={onClick}
      >
        <span className={styles.rowIcon} aria-hidden="true">
          <Icon icon={icon} width={20} height={20} />
        </span>
        <span className={styles.rowLabel}>{label}</span>
      </button>
    </div>
  )
}

/**
 * A row that flips a boolean. Carries a description under the label, because a
 * switch with no explanation is a switch nobody touches.
 *
 * `disabled` + `hint` is the org case: coaches and staff see the setting and
 * are told who can change it, rather than finding an option missing and
 * wondering whether it exists. The real gate is server-side — hiding or
 * disabling a control is never a permission.
 */
export function SettingsToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  hint,
  busy = false,
}: {
  icon: string
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  hint?: string
  /** A write is in flight — the switch stays interactive, just marked. */
  busy?: boolean
}) {
  const labelId = useId()
  const descId = useId()

  return (
    <div className={`${styles.row} ${styles.rowToggle}`}>
      <span className={styles.rowIcon} aria-hidden="true">
        <Icon icon={icon} width={20} height={20} />
      </span>

      <span className={styles.rowToggleText}>
        <span className={styles.rowLabel} id={labelId}>
          {label}
        </span>
        {description && (
          <span className={styles.rowDescription} id={descId}>
            {description}
          </span>
        )}
        {disabled && hint && (
          <span className={styles.rowHint}>{hint}</span>
        )}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`${styles.switch} ${checked ? styles.switchOn : ""} ${
          busy ? styles.switchBusy : ""
        }`}
      >
        <span className={styles.switchKnob} aria-hidden="true" />
      </button>
    </div>
  )
}
