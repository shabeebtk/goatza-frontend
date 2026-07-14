"use client"

import { useId, useRef, type KeyboardEvent } from "react"
import { Icon } from "@iconify/react"
import { USER_ROLES, ROLE_META, type UserRole } from "@/shared/constants/roles"
import styles from "./RoleSelect.module.css"

type RoleSelectProps = {
  value: UserRole | null
  onChange: (role: UserRole) => void
  error?: string
  disabled?: boolean
}

/**
 * Accessible role picker rendered as a set of selectable cards.
 *
 * Follows the WAI-ARIA radiogroup pattern: the group is a single tab stop
 * (roving tabindex), Arrow keys move + select, Space/Enter select the focused
 * card. Labels/descriptions/icons all come from the shared ROLE_META source.
 */
export default function RoleSelect({
  value,
  onChange,
  error,
  disabled,
}: RoleSelectProps) {
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const reactId = useId()
  const errorId = `${reactId}-error`

  const selectedIndex = value ? USER_ROLES.indexOf(value) : -1
  // Roving tabindex: the selected card is the sole tab stop. Before any choice is
  // made, the first card is tabbable so Tab still lands on the group.
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex

  const moveSelection = (nextIndex: number) => {
    const role = USER_ROLES[nextIndex]
    onChange(role)
    cardRefs.current[nextIndex]?.focus()
  }

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (disabled) return

    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault()
        moveSelection((index + 1) % USER_ROLES.length)
        break
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault()
        moveSelection((index - 1 + USER_ROLES.length) % USER_ROLES.length)
        break
      case " ":
      case "Enter":
        e.preventDefault()
        onChange(USER_ROLES[index])
        break
    }
  }

  return (
    <div className={styles.roleSelect}>
      <div
        role="radiogroup"
        aria-label="Select your role"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-disabled={disabled || undefined}
        className={styles.grid}
      >
        {USER_ROLES.map((role, index) => {
          const meta = ROLE_META[role]
          const checked = value === role

          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === tabbableIndex ? 0 : -1}
              disabled={disabled}
              ref={(el) => {
                cardRefs.current[index] = el
              }}
              className={`${styles.card} ${checked ? styles.cardSelected : ""}`}
              onClick={() => onChange(role)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              <span className={styles.cardIcon} aria-hidden="true">
                <Icon icon={meta.icon} width={24} height={24} />
              </span>

              <span className={styles.cardBody}>
                <span className={styles.cardLabel}>{meta.label}</span>
                <span className={styles.cardDescription}>{meta.description}</span>
              </span>

              <span className={styles.cardCheck} aria-hidden="true">
                {checked && <Icon icon="mdi:check-circle" width={20} height={20} />}
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p className={styles.errorMsg} role="alert" id={errorId}>
          <Icon
            icon="mdi:alert-circle-outline"
            width={12}
            height={12}
            aria-hidden="true"
          />
          {error}
        </p>
      )}
    </div>
  )
}
