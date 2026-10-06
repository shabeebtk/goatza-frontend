"use client"

/**
 * StarRating — the only star control in the app. Input and display in one
 * component, because a second read-only copy is how the two drift apart.
 *
 * IT IS A RADIO GROUP, not a row of icon buttons. Five `role="radio"` children
 * inside one `role="radiogroup"`, with the group in the tab order ONCE
 * (roving tabindex: only the active star is tabbable, which is what a radio
 * group does natively) and arrow keys moving between values. An onClick on an
 * icon is invisible to a screen reader and unreachable from a keyboard, and
 * "rate the trial" is a required field — somebody who cannot reach it cannot
 * submit at all.
 *
 * TOUCH FIRST. Each star is a 44×44 target whatever the glyph size, with real
 * gaps, because the whole control is five targets side by side on a phone and
 * a thumb that lands between two of them must not pick the wrong number. That
 * is also why HOVER IS ONLY AN ENHANCEMENT: the preview fill is nice with a
 * mouse and completely absent on a touch screen, so every state has to be
 * legible from the committed value and the word underneath alone.
 *
 * NO TAP-AGAIN-TO-CLEAR. It is undiscoverable, and on a phone it fires by
 * accident — a player who meant to confirm 4 ends up with nothing chosen and
 * no idea why Submit went dead. `onClear` renders an explicit text button
 * instead, and callers that do not need clearing simply omit it.
 *
 * THE WORD UNDER THE STARS is not decoration. Four stars out of five means
 * nothing on its own; "Great" is what makes 3 and 4 different answers.
 */

import { useId, useState } from "react"
import { Icon } from "@iconify/react"

import styles from "./StarRating.module.css"

export const RATING_WORDS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent",
}

const STARS = [1, 2, 3, 4, 5] as const

// The GLYPH size. Separate from the tap target, which stays 44px in the CSS
// whatever this says — that separation is the point. Set as props rather than
// in CSS because Iconify renders an inline svg with its own dimensions and the
// rest of the codebase sizes it exactly this way.
const GLYPH: Record<"sm" | "md" | "lg", number> = { sm: 15, md: 20, lg: 30 }

export function ratingWord(value: number | null | undefined): string {
  return value ? RATING_WORDS[value] ?? "" : ""
}

type StarRatingProps = {
  /** The committed value, or null when nothing is chosen yet. */
  value: number | null
  /** Omit for a read-only display. */
  onChange?: (value: number) => void
  /** Renders a small "Clear" button when provided. Ignored when read-only. */
  onClear?: () => void
  /** Accessible name for the group, e.g. "How was the trial?" */
  label: string
  /** Hides the word under the stars (a compact inline display). */
  hideWord?: boolean
  size?: "sm" | "md" | "lg"
  disabled?: boolean
}

export default function StarRating({
  value,
  onChange,
  onClear,
  label,
  hideWord = false,
  size = "md",
  disabled = false,
}: StarRatingProps) {
  const groupId = useId()
  const glyph = GLYPH[size]
  // Desktop-only preview. Never read for anything but the fill, so a touch
  // device that never sets it loses nothing.
  const [hovered, setHovered] = useState<number | null>(null)

  const readOnly = !onChange
  const interactive = !readOnly && !disabled

  // ── Read-only: plain text + stars, no group semantics ────────
  // A display rating is not a control, so it must not be in the tab order or
  // announced as one. The value goes in an aria-label on one element instead.
  if (readOnly) {
    return (
      <span
        className={`${styles.wrap} ${styles[size]} ${styles.readOnly}`}
        role="img"
        aria-label={`${value ?? 0} out of 5${value ? ` — ${ratingWord(value)}` : ""}`}
      >
        <span className={styles.stars}>
          {STARS.map((star) => (
            <span key={star} className={styles.starStatic}>
              <Icon
                icon={value && star <= value ? "mdi:star" : "mdi:star-outline"}
                width={glyph}
                height={glyph}
                className={value && star <= value ? styles.filled : styles.empty}
              />
            </span>
          ))}
        </span>
        {!hideWord && value ? (
          <span className={styles.word}>{ratingWord(value)}</span>
        ) : null}
      </span>
    )
  }

  const shown = hovered ?? value ?? 0

  // ARROW KEYS, the way a radio group behaves. Home/End jump to the ends.
  // Space and Enter are handled by the button element itself (both fire a
  // click), so they need nothing here.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return

    const current = value ?? 0
    let next: number | null = null

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(5, current + 1)
        break
      case "ArrowLeft":
      case "ArrowDown":
        // From nothing-chosen this lands on 1 rather than stepping below it.
        next = current <= 1 ? 1 : current - 1
        break
      case "Home":
        next = 1
        break
      case "End":
        next = 5
        break
    }

    if (next !== null) {
      e.preventDefault()
      onChange?.(next)
    }
  }

  return (
    <div className={`${styles.wrap} ${styles[size]}`}>
      <div
        className={styles.stars}
        role="radiogroup"
        aria-label={label}
        aria-required="true"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHovered(null)}
      >
        {STARS.map((star) => {
          const checked = value === star
          const lit = star <= shown

          return (
            <button
              key={star}
              type="button"
              id={`${groupId}-${star}`}
              role="radio"
              aria-checked={checked}
              // ROVING TABINDEX: one stop for the whole group. With nothing
              // chosen the first star is the entry point, which is what a
              // native radio group with no selection does.
              tabIndex={checked || (value === null && star === 1) ? 0 : -1}
              aria-label={`${star} — ${RATING_WORDS[star]}`}
              className={styles.star}
              disabled={disabled}
              onClick={() => onChange?.(star)}
              onMouseEnter={() => setHovered(star)}
            >
              <Icon
                icon={lit ? "mdi:star" : "mdi:star-outline"}
                width={glyph}
                height={glyph}
                className={lit ? styles.filled : styles.empty}
              />
            </button>
          )
        })}
      </div>

      {!hideWord && (
        // RESERVED, not conditional: the line holds its height with no value
        // so choosing a star does not push the form down under the thumb.
        <span className={styles.wordRow}>
          <span className={styles.word} aria-live="polite">
            {ratingWord(value)}
          </span>
          {onClear && value !== null && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={onClear}
              disabled={disabled}
            >
              Clear
            </button>
          )}
        </span>
      )}
    </div>
  )
}
