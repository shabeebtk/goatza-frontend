"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { Icon } from "@iconify/react"
import { USER_ROLES, ROLE_META, type UserRole } from "@/shared/constants/roles"
import styles from "./RoleDropdown.module.css"

type RoleDropdownProps = {
  value: UserRole
  onChange: (role: UserRole) => void
  error?: string
  disabled?: boolean
}

/**
 * Compact role picker for the signup form. Collapsed, it shows the selected role;
 * opened, it lists every role with its label AND description (from ROLE_META).
 *
 * Implements the WAI-ARIA listbox pattern: a combobox-style trigger
 * (aria-haspopup="listbox") opens a listbox whose active option is tracked with
 * aria-activedescendant. Full keyboard support (Arrow/Home/End/Enter/Esc).
 */
export default function RoleDropdown({
  value,
  onChange,
  error,
  disabled,
}: RoleDropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])

  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const errorId = `${baseId}-error`
  const optionId = (i: number) => `${baseId}-option-${i}`

  const selectedIndex = USER_ROLES.indexOf(value)
  const selectedMeta = ROLE_META[value]

  const openPanel = () => {
    if (disabled) return
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex)
    setOpen(true)
  }

  const closePanel = (returnFocus = true) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const selectIndex = (index: number) => {
    onChange(USER_ROLES[index])
    closePanel()
  }

  // Move focus into the listbox once it opens, and keep the active option visible.
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (open) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
    }
  }, [open, activeIndex])

  // Close when clicking outside the component.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        e.preventDefault()
        openPanel()
        break
    }
  }

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % USER_ROLES.length)
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + USER_ROLES.length) % USER_ROLES.length)
        break
      case "Home":
        e.preventDefault()
        setActiveIndex(0)
        break
      case "End":
        e.preventDefault()
        setActiveIndex(USER_ROLES.length - 1)
        break
      case "Enter":
      case " ":
        e.preventDefault()
        selectIndex(activeIndex)
        break
      case "Escape":
        e.preventDefault()
        closePanel()
        break
      case "Tab":
        setOpen(false)
        break
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${error ? styles.triggerError : ""} ${
          open ? styles.triggerOpen : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.triggerIcon} aria-hidden="true">
          <Icon icon={selectedMeta.icon} width={20} height={20} />
        </span>
        <span className={styles.triggerLabel}>{selectedMeta.label}</span>
        <span className={styles.chevron} aria-hidden="true">
          <Icon icon="mdi:chevron-down" width={20} height={20} />
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Select your role"
          aria-activedescendant={optionId(activeIndex)}
          tabIndex={-1}
          className={styles.listbox}
          onKeyDown={onListKeyDown}
        >
          {USER_ROLES.map((role, index) => {
            const meta = ROLE_META[role]
            const selected = index === selectedIndex
            const active = index === activeIndex

            return (
              <li
                key={role}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                ref={(el) => {
                  optionRefs.current[index] = el
                }}
                className={`${styles.option} ${
                  active ? styles.optionActive : ""
                } ${selected ? styles.optionSelected : ""}`}
                onClick={() => selectIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className={styles.optionIcon} aria-hidden="true">
                  <Icon icon={meta.icon} width={22} height={22} />
                </span>
                <span className={styles.optionBody}>
                  <span className={styles.optionLabel}>{meta.label}</span>
                  <span className={styles.optionDescription}>
                    {meta.description}
                  </span>
                </span>
                {selected && (
                  <span className={styles.optionCheck} aria-hidden="true">
                    <Icon icon="mdi:check" width={18} height={18} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

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
