"use client"

import { WEEK_DAY_LABELS } from "../../format"
import { WEEK_DAYS, type WeekDay } from "../../types"
import styles from "./DayPicker.module.css"

/**
 * Seven toggle chips, Mon…Sun (aria-pressed). The answer is always in week order,
 * the order the server stores. Key facts' training days and a program's days.
 */
export default function DayPicker({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
}: {
  value: WeekDay[]
  onChange: (next: WeekDay[]) => void
  labelledBy: string
  describedBy?: string
  invalid?: boolean
}) {
  const toggle = (day: WeekDay) => {
    const chosen = value.includes(day) ? value.filter((existing) => existing !== day) : [...value, day]
    onChange(WEEK_DAYS.filter((existing) => chosen.includes(existing)))
  }

  return (
    <div
      className={`${styles.days} ${invalid ? styles.invalid : ""}`}
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {WEEK_DAYS.map((day) => {
        const on = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            className={`${styles.day} ${on ? styles.on : ""}`}
            aria-pressed={on}
            aria-label={WEEK_DAY_LABELS[day].long}
            onClick={() => toggle(day)}
          >
            {WEEK_DAY_LABELS[day].short}
          </button>
        )
      })}
    </div>
  )
}
