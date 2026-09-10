"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { ageToEcho, parseIsoDate, toIsoDate } from "./dateOfBirth.schema"
import styles from "./DateOfBirthInput.module.css"

/**
 * Date of birth as THREE TYPED FIELDS — day, month, year.
 *
 * NOT a calendar picker, and not <input type="date">, and this is the whole
 * reason the component exists rather than reusing either. Both open on today's
 * date. A fifteen-year-old asked for their birthday is therefore asked to
 * scroll back one hundred and eighty months, on a phone, through a widget that
 * shows twelve at a time — and that scroll is the single biggest drop-off on
 * this screen. Three number fields are answered from muscle memory in about
 * four seconds, because everybody already knows how to type their own birthday.
 *
 * Two consequences of that choice, both handled below:
 *
 *   * **Focus has to move by itself.** Two digits in the day box and the caret
 *     belongs in the month box; nobody should have to reach for Tab three times
 *     on a touchscreen. Backspace on an empty field walks back the same way,
 *     or the auto-advance becomes a trap.
 *   * **Typos stop being visible.** A picker cannot produce 1898, and typing
 *     can. So a plausible age is echoed back in plain words underneath, and a
 *     year that does not make one shows no line at all — see the note on that
 *     below.
 */

type Parts = { d: string; m: string; y: string }

function splitIso(value: string): Parts {
  const parsed = parseIsoDate(value)
  if (!parsed) return { d: "", m: "", y: "" }

  return {
    d: String(parsed.day).padStart(2, "0"),
    m: String(parsed.month).padStart(2, "0"),
    y: String(parsed.year),
  }
}

/** Strip everything that isn't a digit and cap the length. */
function digits(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max)
}

interface DateOfBirthInputProps {
  /** ISO "YYYY-MM-DD", or "" when the date isn't complete/valid yet. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  error?: string
  /** Rendered under the age echo — one short line, no more. */
  hint?: string
}

export default function DateOfBirthInput({
  value,
  onChange,
  onBlur,
  disabled,
  error,
  hint,
}: DateOfBirthInputProps) {
  // Local part state, because a half-typed date has no ISO representation.
  // "14" + "03" + "20" composes to nothing, and the user is mid-year — the
  // parent gets "" while this keeps what they typed on screen.
  const [parts, setParts] = useState<Parts>(() => splitIso(value))

  const dayRef = useRef<HTMLInputElement>(null)
  const monthRef = useRef<HTMLInputElement>(null)
  const yearRef = useRef<HTMLInputElement>(null)

  const baseId = useId()
  const errorId = `${baseId}-error`
  const ageId = `${baseId}-age`

  // Re-seed from outside ONLY on a real external change — a form reset, or a
  // prefilled value arriving late. Guarded on the composed value so this can
  // never fight the user's own typing: while they are mid-edit the parent
  // holds "", which never matches a complete local date.
  useEffect(() => {
    const composed = toIsoDate(Number(parts.y), Number(parts.m), Number(parts.d))
    if (value !== composed && value !== "") {
      setParts(splitIso(value))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (next: Parts) => {
    setParts(next)
    // "" for anything incomplete or impossible. The parent's schema decides
    // what to say about it; this only decides whether there is a date at all.
    onChange(toIsoDate(Number(next.y), Number(next.m), Number(next.d)))
  }

  const handleDay = (raw: string) => {
    const d = digits(raw, 2)
    commit({ ...parts, d })
    // Advance on two digits, or on a single digit that cannot be the first of
    // a two-digit day — "4" is April-the-fourth territory, there is no 40th.
    if (d.length === 2 || (d.length === 1 && Number(d) > 3)) {
      monthRef.current?.focus()
    }
  }

  const handleMonth = (raw: string) => {
    const m = digits(raw, 2)
    commit({ ...parts, m })
    if (m.length === 2 || (m.length === 1 && Number(m) > 1)) {
      yearRef.current?.focus()
    }
  }

  const handleYear = (raw: string) => {
    commit({ ...parts, y: digits(raw, 4) })
  }

  /**
   * Backspace at the start of an empty field steps back to the previous one.
   * Without it, auto-advance is a one-way door: the caret jumps to Month, the
   * user notices the day is wrong, and Backspace does nothing they can see.
   */
  const backspaceTo = (
    e: React.KeyboardEvent<HTMLInputElement>,
    current: string,
    previous: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (e.key === "Backspace" && current === "") {
      previous.current?.focus()
    }
  }

  // Guarded, not raw: a year is typed a digit at a time, and every partial one
  // reaches this line. See ageToEcho.
  const age = ageToEcho(value)

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${baseId}-label`}>
        Date of birth
      </span>

      <div
        className={`${styles.row} ${error ? styles.rowError : ""}`}
        role="group"
        aria-labelledby={`${baseId}-label`}
        aria-describedby={error ? errorId : age !== null ? ageId : undefined}
      >
        <input
          ref={dayRef}
          id={`${baseId}-day`}
          className={`${styles.input} ${styles.inputDay}`}
          value={parts.d}
          onChange={(e) => handleDay(e.target.value)}
          onKeyDown={(e) => backspaceTo(e, parts.d, dayRef)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="DD"
          aria-label="Day"
          // inputMode gives phones the number pad; type stays "text" so the
          // browser never renders spinners or silently strips a leading zero.
          inputMode="numeric"
          autoComplete="bday-day"
          maxLength={2}
        />

        <span className={styles.separator} aria-hidden="true">
          /
        </span>

        <input
          ref={monthRef}
          id={`${baseId}-month`}
          className={`${styles.input} ${styles.inputMonth}`}
          value={parts.m}
          onChange={(e) => handleMonth(e.target.value)}
          onKeyDown={(e) => backspaceTo(e, parts.m, dayRef)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="MM"
          aria-label="Month"
          inputMode="numeric"
          autoComplete="bday-month"
          maxLength={2}
        />

        <span className={styles.separator} aria-hidden="true">
          /
        </span>

        <input
          ref={yearRef}
          id={`${baseId}-year`}
          className={`${styles.input} ${styles.inputYear}`}
          value={parts.y}
          onChange={(e) => handleYear(e.target.value)}
          onKeyDown={(e) => backspaceTo(e, parts.y, monthRef)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="YYYY"
          aria-label="Year"
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
        />
      </div>

      {/*
        THE AGE, ECHOED BACK IN WORDS.

        This catches typos that no validation message can. "1898" and "2010"
        are both syntactically perfect dates and a validator has nothing to say
        about either, but "You're 15" appearing — or failing to appear — is
        something the person who typed it reads without having to parse
        anything or map it back to the box they got wrong.

        It shows only for an age below MAX_ECHOED_AGE, which is a rule about
        this line of text and nothing else: no birthday is refused for being
        above it, here or anywhere. A half-typed year ("201", on its way to
        2010) and an implausible one land in the same place — no line yet —
        and that silence is the signal.

        Announced politely so it reaches screen readers as the year is
        completed rather than on every keystroke.
      */}
      {age !== null && !error && (
        <p className={styles.age} id={ageId} aria-live="polite">
          You&rsquo;re {age}
        </p>
      )}

      {hint && !error && <p className={styles.hint}>{hint}</p>}

      {error && (
        <p className={styles.error} id={errorId} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
          {error}
        </p>
      )}
    </div>
  )
}
