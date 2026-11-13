"use client"

import { useId } from "react"

import styles from "./SquadSwitch.module.css"

/**
 * An on/off setting with its label and hint. A real `role="switch"` button, named
 * by the label and described by the hint, the same shape as SettingsMenu's.
 */
export default function SquadSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled,
  busy,
  bordered = true,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** A write is in flight: dimmed, still tappable state-wise but ignored by the caller. */
  busy?: boolean
  bordered?: boolean
}) {
  const ids = useId()
  const labelId = `${ids}-label`
  const hintId = `${ids}-hint`

  return (
    <div className={`${styles.row} ${bordered ? styles.bordered : ""}`}>
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {hint && (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        aria-busy={busy || undefined}
        disabled={disabled}
        className={`${styles.switch} ${checked ? styles.on : ""} ${busy ? styles.busy : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
    </div>
  )
}
