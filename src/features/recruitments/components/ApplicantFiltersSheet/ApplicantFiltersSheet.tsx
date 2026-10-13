"use client"

/**
 * ApplicantFiltersSheet — every filter on the applicants list, in one modal.
 *
 * DRAFT, THEN COMMIT, like the recruitment list's filters: the sheet edits
 * its own copy, and nothing reaches the list (or the server) until "Show
 * results". Closing any other way throws the draft away.
 *
 * Each section shows only where it can mean something: a centre only on a
 * choose_one trial with several, a fee only where there is one, positions
 * only when the sport has them, and "what the player said" only on the
 * Result tab.
 *
 * Centred card from 768px, bottom sheet below. It has a text field (City),
 * so it follows the visible area while the keyboard is up.
 */

import { useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import Select from "@/shared/components/ui/Select/Select"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import { birthYearOptions } from "../../filterOptions"
import {
  APPLICANT_FEE_OPTIONS,
  APPLICANT_GENDER_OPTIONS,
  APPLICANT_SELF_OUTCOME_OPTIONS,
  APPLICANT_SORT_OPTIONS,
  EMPTY_APPLICANT_FILTERS,
  type ApplicantFilterContext,
  type ApplicantFilters,
} from "../../applicantFilters"
import styles from "./ApplicantFiltersSheet.module.css"

/** One row of mutually exclusive chips — a radio group, not a select. */
function OptionChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.optionChips} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value || "any"}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`${styles.optionChip} ${value === option.value ? styles.optionChipActive : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface ApplicantFiltersSheetProps {
  committed: ApplicantFilters
  context: ApplicantFilterContext
  onApply: (next: ApplicantFilters) => void
  onClose: () => void
}

export default function ApplicantFiltersSheet({
  committed,
  context,
  onApply,
  onClose,
}: ApplicantFiltersSheetProps) {
  const id = useId()
  const [draft, setDraft] = useState<ApplicantFilters>(committed)
  const patch = (next: Partial<ApplicantFilters>) =>
    setDraft((current) => ({ ...current, ...next }))

  useBodyScrollLock()
  useVisualViewport()
  const { requestClose } = useBackToClose(onClose)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [requestClose])

  // Fixed for this mount — the top of the range moves with the calendar, and
  // the list must not change under an open sheet.
  const years = useMemo(() => birthYearOptions(), [])
  const yearChoices = (placeholder: string, value: string) => {
    const base = [{ value: "", label: placeholder }, ...years]
    // A committed year the list no longer offers is still shown, or the
    // control would read "Any" while the chip says 1988.
    return value && !years.some((year) => year.value === value)
      ? [...base, { value, label: value }]
      : base
  }

  const showCentres = context.centres.length > 1
  const showPositions = context.positions.length > 0

  const apply = () => {
    onApply(draft)
    requestClose()
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title} id={`${id}-title`}>Filters</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={requestClose}
            aria-label="Close filters"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        <div className={styles.body}>
          {showCentres && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${id}-centre`}>Centre</label>
              <Select
                id={`${id}-centre`}
                value={draft.centre}
                onChange={(centre) => patch({ centre })}
                sheetTitle="Centre"
                options={[
                  { value: "", label: "All centres" },
                  ...context.centres.map((session) => ({
                    value: session.id,
                    label: context.centreLabel(session),
                  })),
                ]}
              />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Born between</span>
            <div className={styles.pair}>
              <Select
                aria-label="Born from"
                value={draft.bornFrom}
                onChange={(bornFrom) => patch({ bornFrom })}
                sheetTitle="Born from"
                options={yearChoices("From", draft.bornFrom)}
              />
              <span className={styles.pairDash} aria-hidden="true">–</span>
              <Select
                aria-label="Born to"
                value={draft.bornTo}
                onChange={(bornTo) => patch({ bornTo })}
                sheetTitle="Born to"
                options={yearChoices("To", draft.bornTo)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Gender</span>
            <OptionChips
              label="Gender"
              options={APPLICANT_GENDER_OPTIONS}
              value={draft.gender}
              onChange={(gender) => patch({ gender })}
            />
          </div>

          {showPositions && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${id}-position`}>Position</label>
              <Select
                id={`${id}-position`}
                value={draft.position}
                onChange={(position) => patch({ position })}
                sheetTitle="Position"
                options={[
                  { value: "", label: "Any position" },
                  ...context.positions.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-city`}>City</label>
            <input
              id={`${id}-city`}
              type="text"
              className={styles.input}
              placeholder="Any city"
              value={draft.city}
              maxLength={100}
              onChange={(e) => patch({ city: e.target.value })}
            />
          </div>

          {context.hasFee && (
            <div className={styles.field}>
              <span className={styles.label}>Fee</span>
              <OptionChips
                label="Fee"
                options={APPLICANT_FEE_OPTIONS}
                value={draft.fee}
                onChange={(fee) => patch({ fee })}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.ageMismatch}
                onChange={(e) => patch({ ageMismatch: e.target.checked })}
              />
              <span>Age mismatch only</span>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={draft.hasHighlights}
                onChange={(e) => patch({ hasHighlights: e.target.checked })}
              />
              <span>Has highlights</span>
            </label>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>Applied between</span>
            <div className={styles.pair}>
              <input
                type="date"
                className={styles.input}
                aria-label="Applied from"
                value={draft.appliedFrom}
                max={draft.appliedTo || undefined}
                onChange={(e) => patch({ appliedFrom: e.target.value })}
              />
              <span className={styles.pairDash} aria-hidden="true">–</span>
              <input
                type="date"
                className={styles.input}
                aria-label="Applied to"
                value={draft.appliedTo}
                min={draft.appliedFrom || undefined}
                onChange={(e) => patch({ appliedTo: e.target.value })}
              />
            </div>
          </div>

          {/* THE WORKFLOW the self-report feature exists for: on the Result
              tab, narrow to "says selected", select all, mark Selected. */}
          {context.isResultTab && (
            <div className={styles.field}>
              <span className={styles.label}>What the player said</span>
              <OptionChips
                label="What the player said"
                options={APPLICANT_SELF_OUTCOME_OPTIONS}
                value={draft.selfOutcome}
                onChange={(selfOutcome) => patch({ selfOutcome })}
              />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Sort</span>
            <OptionChips
              label="Sort"
              options={APPLICANT_SORT_OPTIONS}
              value={draft.sort}
              onChange={(sort) => patch({ sort })}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setDraft(EMPTY_APPLICANT_FILTERS)}
          >
            Clear all
          </button>
          <button type="button" className={styles.applyBtn} onClick={apply}>
            Show results
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
