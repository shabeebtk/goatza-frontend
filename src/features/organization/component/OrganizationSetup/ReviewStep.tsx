"use client"

import type { ReactNode, RefObject } from "react"
import type { Sport } from "@/features/profile/services/sports.api"
import {
  STEP_LABELS,
  levelLabel,
  normalizeWebsite,
  typeLabel,
  type CreateDraft,
  type CreateStep,
} from "./createPageDraft"
import PagePreview from "./PagePreview"
import styles from "./ReviewStep.module.css"

/**
 * Step 4 — the page as it will look, and what each step holds, with an Edit
 * link per section that jumps back to that step.
 */
export default function ReviewStep({
  draft,
  logoUrl,
  coverUrl,
  sports,
  onEdit,
  headingRef,
  disabled,
}: {
  draft: CreateDraft
  logoUrl?: string | null
  coverUrl?: string | null
  sports: Sport[]
  onEdit: (step: CreateStep) => void
  headingRef: RefObject<HTMLHeadingElement | null>
  disabled?: boolean
}) {
  const sportNames = draft.sportIds
    .map((id) => sports.find((sport) => sport.id === id)?.name)
    .filter(Boolean) as string[]
  const website = normalizeWebsite(draft.website)
  const place = draft.city
    ? `${draft.branchName.trim() || "Main Branch"} · ${[draft.city.name, draft.city.state]
        .filter(Boolean)
        .join(", ")}${draft.address.trim() ? ` · ${draft.address.trim()}` : ""}`
    : ""

  return (
    <section className={styles.step} aria-labelledby="org-create-review-heading">
      <h2
        id="org-create-review-heading"
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
      >
        Review your page
      </h2>
      <p className={styles.lead}>This is how your page will start out.</p>

      <PagePreview draft={draft} logoUrl={logoUrl} coverUrl={coverUrl} sports={sports} />

      <ul className={styles.sections}>
        <Section label={STEP_LABELS.type} step="type" onEdit={onEdit} disabled={disabled}>
          {typeLabel(draft.type)}
        </Section>

        <Section label={STEP_LABELS.basics} step="basics" onEdit={onEdit} disabled={disabled}>
          <span className={styles.line}>{draft.name.trim()}</span>
          <span className={styles.line}>@{draft.username.trim()}</span>
          {draft.level && <span className={styles.line}>{levelLabel(draft.level)}</span>}
          {website && <span className={styles.line}>{website}</span>}
          {!draft.headline.trim() && !draft.description.trim() && (
            <span className={styles.muted}>No tagline or about yet</span>
          )}
        </Section>

        <Section label={STEP_LABELS.location} step="location" onEdit={onEdit} disabled={disabled}>
          {place ? <span className={styles.line}>{place}</span> : (
            <span className={styles.muted}>No location yet</span>
          )}
          {sportNames.length > 0 ? (
            <span className={styles.line}>
              {sportNames[0]}
              {sportNames.length > 1 ? ` (primary), ${sportNames.slice(1).join(", ")}` : ""}
            </span>
          ) : (
            <span className={styles.muted}>No sports yet</span>
          )}
        </Section>
      </ul>
    </section>
  )
}

function Section({
  label,
  step,
  onEdit,
  disabled,
  children,
}: {
  label: string
  step: CreateStep
  onEdit: (step: CreateStep) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <li className={styles.section}>
      <div className={styles.sectionText}>
        <p className={styles.sectionLabel}>{label}</p>
        <div className={styles.sectionValue}>{children}</div>
      </div>
      <button
        type="button"
        className={styles.edit}
        onClick={() => onEdit(step)}
        disabled={disabled}
        aria-label={`Edit ${label.toLowerCase()}`}
      >
        Edit
      </button>
    </li>
  )
}
