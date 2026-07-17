"use client"

import { useId, useMemo, useState } from "react"
import styles from "./DateOfBirthPicker.module.css"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Oldest birth year we offer. 100 years covers every realistic athlete/coach.
const MAX_YEARS_BACK = 100

type Parts = { d: string; m: string; y: string }

// Days in a given month. Year 0 (not yet chosen) → assume a leap year so Feb 29
// stays selectable until the year narrows it.
function daysInMonth(year: number, month: number): number {
  if (!month) return 31
  if (!year) return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return new Date(year, month, 0).getDate()
}

function parseValue(value: string | null | undefined): Parts {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return { d: "", m: "", y: "" }
  return { y: match[1], m: String(Number(match[2])), d: String(Number(match[3])) }
}

// Compose "YYYY-MM-DD" only when all three parts are set and form a real,
// non-future calendar date; otherwise null (treated as "not answered").
function composeValue(parts: Parts): string | null {
  const { d, m, y } = parts
  if (!d || !m || !y) return null

  const year = Number(y)
  const month = Number(m)
  const day = Number(d)

  if (day > daysInMonth(year, month)) return null

  const date = new Date(year, month - 1, day)
  if (date > new Date()) return null

  const mm = String(month).padStart(2, "0")
  const dd = String(day).padStart(2, "0")
  return `${year}-${mm}-${dd}`
}

interface DateOfBirthPickerProps {
  value: string | null | undefined
  /** Emits "YYYY-MM-DD" once all three parts form a valid past date, else null. */
  onChange: (value: string | null) => void
  disabled?: boolean
  /** Wires the day <select> to an external <label htmlFor>. */
  id?: string
}

export default function DateOfBirthPicker({
  value,
  onChange,
  disabled,
  id,
}: DateOfBirthPickerProps) {
  // Local part state so a partial selection (e.g. day + month, no year yet)
  // survives even though it composes to null upstream.
  const [parts, setParts] = useState<Parts>(() => parseValue(value))

  const autoId = useId()
  const baseId = id ?? autoId

  const currentYear = new Date().getFullYear()
  const years = useMemo(
    () => Array.from({ length: MAX_YEARS_BACK + 1 }, (_, i) => currentYear - i),
    [currentYear],
  )

  const maxDay = daysInMonth(Number(parts.y), Number(parts.m))
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay],
  )

  const update = (next: Parts) => {
    // A shorter month/year can invalidate a previously-picked day → clamp it.
    const cap = daysInMonth(Number(next.y), Number(next.m))
    if (next.d && Number(next.d) > cap) next = { ...next, d: String(cap) }
    setParts(next)
    onChange(composeValue(next))
  }

  return (
    <div className={styles.row} role="group" aria-label="Date of birth">
      <select
        id={baseId}
        className={styles.select}
        value={parts.d}
        disabled={disabled}
        onChange={(e) => update({ ...parts, d: e.target.value })}
        aria-label="Day"
      >
        <option value="">Day</option>
        {days.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <select
        className={styles.select}
        value={parts.m}
        disabled={disabled}
        onChange={(e) => update({ ...parts, m: e.target.value })}
        aria-label="Month"
      >
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>

      <select
        className={styles.select}
        value={parts.y}
        disabled={disabled}
        onChange={(e) => update({ ...parts, y: e.target.value })}
        aria-label="Year"
      >
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}
