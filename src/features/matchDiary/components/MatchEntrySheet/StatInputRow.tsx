"use client"

/**
 * One loggable stat: a label, a stepper, a number.
 *
 * NOTHING IN THIS FILE KNOWS WHAT SPORT IT IS RENDERING. Everything it needs
 * comes off the catalog row — the label, the unit, whether decimals are
 * allowed, how big a step is. That is the whole reason the catalog is data and
 * not code, and it is why adding a sport is a seed command rather than a
 * frontend release.
 *
 * The stepper is the point. "2 goals" is two taps of +, with no keyboard, no
 * keyboard covering the form, and no chance of a fat-fingered 22. The keypad is
 * still there for a number nobody wants to tap to (a bowler's 78 balls).
 */

import { Icon } from "@iconify/react"

import { MAX_STAT_VALUE, type MatchStatField } from "../../types"
import styles from "./MatchEntrySheet.module.css"

// ── Input rules ───────────────────────────────────────────────

/** What one tap of + or − is worth, per value type. */
const stepFor = (field: MatchStatField): number =>
    field.value_type === "integer" ? 1 : 0.5

/** A number back to the string the input holds. */
const formatStat = (value: number, field: MatchStatField): string =>
    field.value_type === "integer"
        ? String(Math.round(value))
        : String(parseFloat(value.toFixed(1)))

export type StatInputChange = {
    /** What the input should now hold. */
    value: string
    /** A one-line explanation, when a keystroke was refused or trimmed. */
    note: string | null
}

/**
 * Hold a typed value to what its catalog row allows, at the keystroke.
 *
 * An INTEGER stat refuses the separator outright and keeps what was there —
 * deliberately NOT "strip the dot", which would turn a typed 2.5 into 25 and
 * put a number in the player's season total that they never entered.
 *
 * A DECIMAL stat keeps one place. The column holds two, so this is stricter
 * than the server: nobody records 10.55km, and the extra digit is only ever a
 * mis-tap. It says so rather than silently swallowing the keystroke.
 */
export const sanitizeStatInput = (
    raw: string,
    previous: string,
    field: MatchStatField
): StatInputChange => {
    if (raw === "") return { value: "", note: null }

    // Numeric keypads on some Android locales emit a comma for the decimal key.
    const normalized = raw.replace(/,/g, ".")

    // A letter, a sign, an exponent: nothing to explain, nothing to type.
    if (/[^\d.]/.test(normalized)) return { value: previous, note: null }

    if (field.value_type === "integer") {
        if (normalized.includes(".")) {
            return {
                value: previous,
                note: `${field.name} is a whole number.`,
            }
        }
        return { value: normalized, note: null }
    }

    const [whole, ...rest] = normalized.split(".")
    if (rest.length === 0) return { value: whole, note: null }

    const decimals = rest.join("")

    return {
        // ".5" reads back as "0.5" — the same number, and one a player can see
        // is a number.
        value: `${whole || "0"}.${decimals.slice(0, 1)}`,
        note: decimals.length > 1 ? "One decimal place." : null,
    }
}

/**
 * One tap of + or −.
 *
 * Stepping DOWN past zero clears the field rather than stopping at 0, because
 * "" and 0 are different facts here: a striker who took no shots and one who
 * never bothered recording shots are not the same, and the summary counts them
 * separately. Zero is still reachable — + then − — it just isn't where the
 * stepper bottoms out.
 */
export const stepStatValue = (
    current: string,
    field: MatchStatField,
    direction: 1 | -1
): string => {
    const step = stepFor(field)
    const trimmed = current.trim()
    const parsed = trimmed ? Number(trimmed) : null

    if (parsed === null || !Number.isFinite(parsed)) {
        return direction > 0 ? formatStat(step, field) : ""
    }

    const next = parsed + step * direction

    if (next < 0) return ""
    if (next > MAX_STAT_VALUE) return current

    return formatStat(next, field)
}

// ── Row ───────────────────────────────────────────────────────

export default function StatInputRow({
    field,
    value,
    error,
    note,
    disabled,
    onChange,
}: {
    field: MatchStatField
    value: string
    error?: string
    note?: string | null
    disabled?: boolean
    onChange: (change: StatInputChange) => void
}) {
    const inputId = `stat-${field.id}`

    return (
        <div className={styles.statRow}>
            <label className={styles.statLabel} htmlFor={inputId}>
                <span className={styles.statName}>{field.name}</span>
                {field.short_label && (
                    <span className={styles.statShort} aria-hidden="true">
                        {field.short_label}
                    </span>
                )}
            </label>

            <div className={styles.stepper}>
                <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() =>
                        onChange({
                            value: stepStatValue(value, field, -1),
                            note: null,
                        })
                    }
                    disabled={disabled || value.trim() === ""}
                    aria-label={`One less ${field.name}`}
                >
                    <Icon icon="mdi:minus" width={16} height={16} />
                </button>

                <div className={styles.statInputWrap}>
                    <input
                        id={inputId}
                        className={styles.statInput}
                        // "decimal" rather than "numeric" for a decimal stat is
                        // what puts the dot on an iOS keypad at all.
                        inputMode={
                            field.value_type === "integer"
                                ? "numeric"
                                : "decimal"
                        }
                        // `type="text"` on purpose: a number input drops what a
                        // player typed on blur when it is momentarily invalid,
                        // and Safari lets a spin-arrow scroll change it.
                        type="text"
                        autoComplete="off"
                        value={value}
                        placeholder="–"
                        disabled={disabled}
                        aria-invalid={Boolean(error)}
                        onChange={(event) =>
                            onChange(
                                sanitizeStatInput(
                                    event.target.value,
                                    value,
                                    field
                                )
                            )
                        }
                    />
                    {field.unit && (
                        <span className={styles.statUnit} aria-hidden="true">
                            {field.unit}
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() =>
                        onChange({
                            value: stepStatValue(value, field, 1),
                            note: null,
                        })
                    }
                    disabled={disabled}
                    aria-label={`One more ${field.name}`}
                >
                    <Icon icon="mdi:plus" width={16} height={16} />
                </button>
            </div>

            {(error || note) && (
                <p
                    className={error ? styles.statError : styles.statNote}
                    role={error ? "alert" : "status"}
                >
                    {error || note}
                </p>
            )}
        </div>
    )
}
