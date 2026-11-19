"use client"

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react"
import { Icon } from "@iconify/react"

import styles from "./PageFields.module.css"

/**
 * The page editors' fields: a label, the control, then a hint or an error, both
 * tied to the control with aria-describedby, and aria-invalid while there is an
 * error. Built here because the shared Input spreads its own props onto the
 * element and leaves its error unlinked.
 */

type FieldFrameProps = {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  /** Something to the right of the label: a counter, a quick action. */
  aside?: ReactNode
  children: ReactNode
}

export function fieldDescribedBy(id: string, { hint, error }: { hint?: ReactNode; error?: string }) {
  return [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean).join(" ") || undefined
}

export function FieldFrame({ id, label, hint, error, aside, children }: FieldFrameProps) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  aside?: ReactNode
  /** An icon inside the field, on the left. */
  icon?: string
}

export const PageTextField = forwardRef<HTMLInputElement, TextFieldProps>(function PageTextField(
  { id, label, hint, error, aside, icon, className, ...input },
  ref
) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} aside={aside}>
      <div className={styles.control}>
        {icon && (
          <Icon icon={icon} width={20} height={20} className={styles.controlIcon} aria-hidden="true" />
        )}
        <input
          ref={ref}
          id={id}
          className={`${styles.input} ${icon ? styles.inputWithIcon : ""} ${
            error ? styles.invalid : ""
          } ${className ?? ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { hint, error })}
          {...input}
        />
      </div>
    </FieldFrame>
  )
})

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  aside?: ReactNode
}

export const PageTextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function PageTextArea(
  { id, label, hint, error, aside, className, ...textarea },
  ref
) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} aside={aside}>
      <textarea
        ref={ref}
        id={id}
        className={`${styles.input} ${styles.textarea} ${error ? styles.invalid : ""} ${
          className ?? ""
        }`}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { hint, error })}
        {...textarea}
      />
    </FieldFrame>
  )
})
