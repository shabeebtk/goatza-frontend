"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import { sectionDomId } from "../../profileSections"
import styles from "./ProfileSection.module.css"

/**
 * One section of the page on the profile: its divider, then
 * `<section id="page-<key>">` labelled by its h2. The divider belongs to the
 * section, so a section that draws nothing leaves no line behind.
 *
 * `tabIndex={-1}` is for the sticky bar, which moves focus here after scrolling.
 */
export default function ProfileSection({
  sectionKey,
  title,
  meta,
  subtitle,
  divider = true,
  children,
}: {
  sectionKey: string
  title: string
  /** A muted count beside the title: "4 programs". */
  meta?: string
  /** A muted line under the title. */
  subtitle?: string
  /** Off where the section stands in a card of its own (the desktop aside). */
  divider?: boolean
  children: ReactNode
}) {
  const id = sectionDomId(sectionKey)
  return (
    <>
      {divider && <div className={styles.divider} />}
      <section id={id} aria-labelledby={`${id}-title`} tabIndex={-1} className={styles.section}>
        <div className={styles.head}>
          <div className={styles.titleRow}>
            <h2 id={`${id}-title`} className={styles.title}>
              {title}
            </h2>
            {meta && <span className={styles.meta}>{meta}</span>}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {children}
      </section>
    </>
  )
}

/**
 * A section another feature draws whole (squads, trials, posts): only the
 * anchor the bar scrolls to. `divider` for the ones that bring none of their own.
 */
export function SectionAnchor({
  sectionKey,
  label,
  divider = false,
  children,
}: {
  sectionKey: string
  /** The region's name, for those whose heading isn't ours to label. */
  label?: string
  divider?: boolean
  children: ReactNode
}) {
  const id = sectionDomId(sectionKey)
  return (
    <>
      {divider && <div className={styles.divider} />}
      {label ? (
        <section id={id} aria-label={label} tabIndex={-1} className={styles.anchor}>
          {children}
        </section>
      ) : (
        <div id={id} tabIndex={-1} className={styles.anchor}>
          {children}
        </div>
      )}
    </>
  )
}

/** "See all 6 programs" / "Show fewer", expanding the list in place. */
export function ShowAllButton({
  expanded,
  total,
  noun,
  controls,
  onToggle,
}: {
  expanded: boolean
  total: number
  /** Plural: "programs". */
  noun: string
  /** The list's id. */
  controls: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={styles.showAll}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      {expanded ? "Show fewer" : `See all ${total} ${noun}`}
      <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} width={18} height={18} aria-hidden="true" />
    </button>
  )
}
