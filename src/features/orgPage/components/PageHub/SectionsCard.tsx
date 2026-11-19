"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useUpdateSections } from "../../hooks/useOrgPage"
import {
  SECTION_META,
  sectionHasContent,
  sectionOrder,
  sectionStatusLine,
} from "../../sectionMeta"
import type { PageSections, SectionKey, SwitchableSection } from "../../types"
import PageSwitch from "../PageSwitch/PageSwitch"
import styles from "./PageHub.module.css"

/**
 * Every section in the order the page shows it. The right side is the switch when
 * there is something to hide (or it is already hidden), an "Add" pill when the
 * section is on but empty (it stays hidden until something is added), and nothing
 * for posts, which are always shown.
 */
export default function SectionsCard({
  orgId,
  orgType,
  sections,
  canEdit,
}: {
  orgId: string
  orgType: string | undefined
  sections: PageSections
  canEdit: boolean
}) {
  const toast = useToast()
  const updateSections = useUpdateSections(orgId)

  const flip = (key: SwitchableSection, next: boolean) => {
    // Reversible, so nothing is asked; a refusal rolls back and toasts in the hook.
    updateSections.mutate(
      { [key]: next },
      {
        onSuccess: () =>
          toast.show({
            title: next ? "Shown on your page" : "Hidden from your page",
            variant: "success",
            position: "top-center",
            duration: 2000,
          }),
      }
    )
  }

  return (
    <section className={styles.card} aria-labelledby="page-hub-sections">
      <div className={styles.cardHeader}>
        <h2 id="page-hub-sections" className={styles.cardTitle}>
          Sections on your page
        </h2>
      </div>
      <p className={styles.cardIntro}>
        Switch a section off to hide it. A section with nothing in it stays hidden until you add
        something.
      </p>

      <ul className={styles.sectionList}>
        {sectionOrder(orgType).map((key) => (
          <SectionRow
            key={key}
            orgId={orgId}
            sectionKey={key}
            sections={sections}
            canEdit={canEdit}
            onFlip={flip}
          />
        ))}
      </ul>
    </section>
  )
}

function SectionRow({
  orgId,
  sectionKey,
  sections,
  canEdit,
  onFlip,
}: {
  orgId: string
  sectionKey: SectionKey
  sections: PageSections
  canEdit: boolean
  onFlip: (key: SwitchableSection, next: boolean) => void
}) {
  const status = sections[sectionKey]
  // An older server without this section: leave the row out rather than guess.
  if (!status) return null

  const meta = SECTION_META[sectionKey]
  const href = meta.href(orgId)
  const statusLine = sectionStatusLine(sectionKey, sections)
  const hasContent = sectionHasContent(sectionKey, sections)
  const statusId = `page-section-${sectionKey}-status`
  // Hidden on purpose reads differently from "nothing here yet".
  const hiddenNote = status.switchable && !status.enabled ? " · Hidden" : ""

  let control: ReactNode = null
  if (status.switchable && (hasContent || !status.enabled)) {
    control = (
      <PageSwitch
        label={`Show ${meta.title} on your page`}
        describedBy={statusId}
        checked={status.enabled}
        disabled={!canEdit}
        onChange={(next) => onFlip(sectionKey as SwitchableSection, next)}
      />
    )
  } else if (status.switchable && canEdit) {
    control = (
      <Link href={href} className={styles.addPill}>
        <Icon icon="mdi:plus" width={16} height={16} aria-hidden="true" />
        Add
        <span className={styles.srOnly}> {meta.title}</span>
      </Link>
    )
  }

  return (
    <li className={`${styles.sectionRow} ${status.enabled ? "" : styles.sectionRowOff}`}>
      <Link href={href} className={styles.sectionLink}>
        <span className={styles.sectionIcon} aria-hidden="true">
          <Icon icon={meta.icon} width={20} height={20} />
        </span>
        <span className={styles.sectionText}>
          <span className={styles.sectionTitle}>{meta.title}</span>
          <span id={statusId} className={styles.sectionStatus}>
            {statusLine}
            {hiddenNote}
          </span>
        </span>
      </Link>
      {control && <span className={styles.sectionControl}>{control}</span>}
    </li>
  )
}
