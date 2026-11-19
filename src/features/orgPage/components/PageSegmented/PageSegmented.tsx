"use client"

import { useRef, type KeyboardEvent } from "react"

import styles from "./PageSegmented.module.css"

export type SegmentOption<T extends string> = { value: T; label: string }

/**
 * A row of pills where exactly one is chosen. As a `radiogroup` (a form's Level,
 * Fee, Spots) or a `tablist` (the people page's tabs). Arrow keys move the choice
 * and the focus together, and only the chosen pill is in the tab order.
 */
export default function PageSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  kind = "radiogroup",
  id,
  invalid,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  /** Names the group, when nothing visible does. */
  label?: string
  labelledBy?: string
  kind?: "radiogroup" | "tablist"
  id?: string
  invalid?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const itemRole = kind === "tablist" ? "tab" : "radio"

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (!step && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      id={id}
      role={kind}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-invalid={kind === "radiogroup" && invalid ? true : undefined}
      className={styles.group}
    >
      {options.map((option, index) => {
        const chosen = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role={itemRole}
            aria-checked={kind === "radiogroup" ? chosen : undefined}
            aria-selected={kind === "tablist" ? chosen : undefined}
            tabIndex={chosen ? 0 : -1}
            className={`${styles.option} ${chosen ? styles.chosen : ""}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
