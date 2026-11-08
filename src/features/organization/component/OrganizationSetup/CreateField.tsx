"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"
import type { CreateField as CreateFieldKey } from "./createPageDraft"
import styles from "./CreateField.module.css"

/** The text-input skin every step uses, so one rule styles them all. */
export const createInputClass = styles.input

/** The one id scheme, so "focus the first error" can find any field. */
export const fieldId = (field: CreateFieldKey) => `org-create-${field}`

/**
 * The ids an input should list in `aria-describedby`, in reading order:
 * hint, counter, error. Only the parts that are rendered.
 */
export function describedBy(
  field: CreateFieldKey,
  parts: { hint?: boolean; count?: boolean; error?: boolean }
): string | undefined {
  const id = fieldId(field)
  const ids = [
    parts.hint && `${id}-hint`,
    parts.count && `${id}-count`,
    parts.error && `${id}-error`,
  ].filter(Boolean)
  return ids.length ? ids.join(" ") : undefined
}

/**
 * A labelled field. The `<label htmlFor>` names the input whose id is
 * `fieldId(field)`; the caller renders that input as `children` and points its
 * aria-describedby at `describedBy(...)` with the same parts.
 */
export default function CreateField({
  field,
  label,
  required,
  optional,
  hint,
  error,
  count,
  children,
}: {
  field: CreateFieldKey
  label: string
  required?: boolean
  optional?: boolean
  hint?: ReactNode
  error?: string
  /** A live character counter: `{ value, max }`. */
  count?: { value: number; max: number }
  children: ReactNode
}) {
  const id = fieldId(field)
  const near = count ? count.value >= count.max * 0.9 : false

  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
          {optional && <span className={styles.optional}> (optional)</span>}
        </label>
        {count && (
          <span
            id={`${id}-count`}
            className={`${styles.count} ${near ? styles.countNear : ""}`}
            aria-live="polite"
          >
            <span className={styles.srOnly}>Characters used: </span>
            {count.value}/{count.max}
          </span>
        )}
      </div>

      {children}

      {hint && !error && (
        <p id={`${id}-hint`} className={styles.hint}>{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
