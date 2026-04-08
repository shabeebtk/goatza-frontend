"use client"

/**
 * LocationPicker
 *
 * Reusable city-search input backed by Mapbox Geocoding.
 * Shows a dropdown of matching cities; selecting one calls onSelect.
 * Never exposes lat/lng to the user — only the human-readable label.
 *
 * Usage:
 *   <LocationPicker
 *     value={selectedCity}     // MapboxCity | null
 *     onChange={setSelectedCity}
 *     placeholder="Search city…"
 *   />
 *
 * To use in post context, just mount it in any form — it's stateless.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { searchCities, type MapboxCity } from "@/shared/services/mapbox.service"
import styles from "./LocationPicker.module.css"

// ── Props ─────────────────────────────────────────────────────

interface LocationPickerProps {
  /** Currently selected city (null = nothing selected) */
  value: MapboxCity | null
  onChange: (city: MapboxCity | null) => void
  placeholder?: string
  disabled?: boolean
  /** Show clear button even when disabled */
  clearable?: boolean
  /** Error message from parent form */
  error?: string
}

// ── Component ─────────────────────────────────────────────────

export default function LocationPicker({
  value,
  onChange,
  placeholder = "Search city…",
  disabled = false,
  clearable = true,
  error,
}: LocationPickerProps) {
  const [query,   setQuery]   = useState("")
  const [results, setResults] = useState<MapboxCity[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // ── Close dropdown on outside click ──────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Debounced search ──────────────────────────────────────────
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setFetchError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const cities = await searchCities(q)
        setResults(cities)
        setOpen(true)
      } catch {
        setFetchError("Couldn't load suggestions.")
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  // ── Select a city ─────────────────────────────────────────────
  const handleSelect = (city: MapboxCity) => {
    onChange(city)
    setQuery("")
    setResults([])
    setOpen(false)
  }

  // ── Clear ─────────────────────────────────────────────────────
  const handleClear = () => {
    onChange(null)
    setQuery("")
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  // ── Keyboard nav ──────────────────────────────────────────────
  const [highlightIdx, setHighlightIdx] = useState(-1)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(results[highlightIdx])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const isSelected = !!value

  return (
    <div ref={containerRef} className={styles.root}>

      {/* ── Selected value display ── */}
      {isSelected ? (
        <div className={`${styles.selectedPill} ${disabled ? styles.selectedPillDisabled : ""}`}>
          <span className={styles.selectedIcon} aria-hidden="true">
            <Icon icon="mdi:map-marker" width={16} height={16} />
          </span>
          <div className={styles.selectedInfo}>
            <span className={styles.selectedCity}>{value.name}</span>
            {(value.state || value.country_code) && (
              <span className={styles.selectedMeta}>
                {[value.state, value.country_code].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
          {clearable && !disabled && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClear}
              aria-label="Clear location"
            >
              <Icon icon="mdi:close" width={14} height={14} />
            </button>
          )}
        </div>
      ) : (
        /* ── Search input ── */
        <div className={`${styles.inputWrap} ${error ? styles.inputWrapError : ""} ${open ? styles.inputWrapOpen : ""}`}>
          <span className={styles.inputIcon} aria-hidden="true">
            {loading
              ? <Icon icon="mdi:loading" width={16} height={16} className={styles.spin} />
              : <Icon icon="mdi:map-marker-outline" width={16} height={16} />}
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder={placeholder}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search city"
            aria-expanded={open}
            aria-haspopup="listbox"
            role="combobox"
          />
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <p className={styles.errorMsg} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
          {error}
        </p>
      )}
      {fetchError && (
        <p className={styles.errorMsg} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={11} height={11} />
          {fetchError}
        </p>
      )}

      {/* ── Dropdown ── */}
      {open && results.length > 0 && (
        <ul
          className={styles.dropdown}
          role="listbox"
          aria-label="City suggestions"
        >
          {results.map((city, i) => (
            <li
              key={city.external_id}
              role="option"
              aria-selected={i === highlightIdx}
              className={`${styles.dropdownItem} ${i === highlightIdx ? styles.dropdownItemHighlight : ""}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(city) }}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              <span className={styles.dropdownIcon} aria-hidden="true">
                <Icon icon="mdi:city-variant-outline" width={14} height={14} />
              </span>
              <span className={styles.dropdownLabel}>{city.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {open && !loading && query.length >= 2 && results.length === 0 && !fetchError && (
        <div className={styles.dropdownEmpty}>
          <Icon icon="mdi:map-search-outline" width={16} height={16} />
          No cities found for "{query}"
        </div>
      )}
    </div>
  )
}