"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import {
  COUNTRIES,
  defaultCountryCode,
  findCountry,
  type Country,
} from "./countries"
import styles from "./CountrySelect.module.css"

/**
 * A searchable country picker that stores the ISO alpha-2 code.
 *
 * WHY IT PREFILLS
 *
 * There are 190-odd countries and every user has exactly one right answer,
 * which they already know. An empty select turns that into a scroll or a
 * search for all of them — on a signup form, where every extra interaction is
 * somebody who does not finish. So the field opens on an answer: derived from
 * the dialling code when the user is signing up by phone, and India otherwise,
 * because that is where the users are and a modal default is worth more than a
 * neutral one.
 *
 * It is always changeable. A prefill is a guess offered, not an answer
 * recorded, and the entire cost of guessing wrong is one tap.
 *
 * WHAT IT DOES NOT SAY
 *
 * There is no explanation under this field about what the country decides. It
 * feeds the age gate (the consent age is per-jurisdiction — see
 * accounts/constants.py in the backend), and a user who knows that has been
 * handed the list of countries with a lower one.
 */

interface CountrySelectProps {
  /** ISO alpha-2 code, or "" when nothing is chosen yet. */
  value: string
  onChange: (code: string) => void
  /**
   * The number being signed up with, if any. Used ONLY to seed the prefill —
   * a country derived from it is a starting point, never a lock.
   */
  phone?: string | null
  label?: string
  disabled?: boolean
  error?: string
}

export default function CountrySelect({
  value,
  onChange,
  phone,
  label = "Country",
  disabled,
  error,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const baseId = useId()
  const listId = `${baseId}-list`
  const errorId = `${baseId}-error`

  const selected = findCountry(value)

  // Seed the field the first time it renders without a value. Runs on `phone`
  // too, so a country typed into the phone box after this mounted still lands
  // — but never once the user has a value, or it would overwrite their choice
  // every time they edited their number.
  useEffect(() => {
    if (!value) onChange(defaultCountryCode(phone))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone])

  const matches = useMemo((): Country[] => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES

    // Name, code and dialling code all match, so "91", "+91", "IN" and "ind"
    // all find India. Prefix matches sort first — typing "in" should offer
    // India before Argentina.
    const bare = q.replace(/^\+/, "")
    const scored = COUNTRIES.map((c) => {
      const name = c.name.toLowerCase()
      if (name.startsWith(q)) return { c, rank: 0 }
      if (c.code.toLowerCase() === q) return { c, rank: 1 }
      if (bare && c.dial === bare) return { c, rank: 2 }
      if (name.includes(q)) return { c, rank: 3 }
      if (bare && c.dial.startsWith(bare) && /^\d+$/.test(bare)) {
        return { c, rank: 4 }
      }
      return null
    }).filter((m): m is { c: Country; rank: number } => m !== null)

    scored.sort((a, b) => a.rank - b.rank)
    return scored.map((m) => m.c)
  }, [query])

  // Close on an outside click or on Escape.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open])

  // Opening moves the caret straight into the search box — the point of a
  // searchable select is that you can start typing.
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  // Keep the highlighted row in view while arrowing through 190 entries.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  const choose = (code: string) => {
    onChange(code)
    setOpen(false)
    setQuery("")
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (matches[activeIndex]) choose(matches[activeIndex].code)
        break
    }
  }

  return (
    <div className={styles.field} ref={containerRef}>
      <span className={styles.label} id={`${baseId}-label`}>
        {label}
      </span>

      <button
        type="button"
        className={`${styles.trigger} ${error ? styles.triggerError : ""}`}
        onClick={() => {
          setOpen((v) => !v)
          setActiveIndex(0)
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${baseId}-label`}
        aria-describedby={error ? errorId : undefined}
      >
        <span className={styles.triggerValue}>
          {selected ? selected.name : "Select country"}
        </span>
        <Icon
          icon="mdi:chevron-down"
          width={18}
          height={18}
          className={styles.chevron}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.searchWrap}>
            <Icon
              icon="mdi:magnify"
              width={16}
              height={16}
              aria-hidden="true"
              className={styles.searchIcon}
            />
            <input
              ref={searchRef}
              className={styles.search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search countries"
              aria-label="Search countries"
              aria-controls={listId}
              autoComplete="off"
            />
          </div>

          <ul
            className={styles.list}
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label="Country"
          >
            {matches.map((country, index) => (
              <li
                key={country.code}
                data-index={index}
                role="option"
                aria-selected={country.code === value}
                className={`${styles.option} ${
                  index === activeIndex ? styles.optionActive : ""
                } ${country.code === value ? styles.optionSelected : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(country.code)}
              >
                <span className={styles.optionName}>{country.name}</span>
                <span className={styles.optionDial}>+{country.dial}</span>
              </li>
            ))}

            {matches.length === 0 && (
              <li className={styles.empty}>No countries match “{query}”</li>
            )}
          </ul>
        </div>
      )}

      {error && (
        <p className={styles.error} id={errorId} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={12} height={12} />
          {error}
        </p>
      )}
    </div>
  )
}
