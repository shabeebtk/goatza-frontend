"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { searchPlaces, type MapboxPlace } from "@/shared/services/mapbox.service"
import styles from "./PostLocationPicker.module.css"

interface PostLocationPickerProps {
  value:     MapboxPlace | null
  onChange:  (place: MapboxPlace | null) => void
  disabled?: boolean
}

export default function PostLocationPicker({
  value,
  onChange,
  disabled = false,
}: PostLocationPickerProps) {
  const [query,   setQuery]   = useState("")
  const [results, setResults] = useState<MapboxPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [hiIdx,   setHiIdx]   = useState(-1)

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setHiIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.trim().length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(q)
        setResults(res)
        setOpen(true)
      } catch {
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  const handleSelect = (place: MapboxPlace) => {
    onChange(place)
    setQuery("")
    setResults([])
    setOpen(false)
    setHiIdx(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return
    if (e.key === "ArrowDown")  { e.preventDefault(); setHiIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === "ArrowUp")    { e.preventDefault(); setHiIdx(i => Math.max(i - 1, 0)) }
    if (e.key === "Enter" && hiIdx >= 0) { e.preventDefault(); handleSelect(results[hiIdx]) }
    if (e.key === "Escape")     { setOpen(false) }
  }

  // Icon per Mapbox place_type
  const placeIcon = (type: string) => {
    if (type === "poi")    return "mdi:map-marker-outline"
    if (type === "region") return "mdi:map-outline"
    return "mdi:city-variant-outline"
  }

  // ── Selected state — compact pill ──────────────────────────────
  if (value) {
    return (
      <div className={styles.selectedPill}>
        <Icon icon="mdi:map-marker" width={13} height={13} className={styles.pillIcon} />
        <span className={styles.pillLabel}>{value.label}</span>
        {!disabled && (
          <button
            type="button"
            className={styles.pillClear}
            onClick={() => onChange(null)}
            aria-label="Remove location"
          >
            <Icon icon="mdi:close" width={12} height={12} />
          </button>
        )}
      </div>
    )
  }

  // ── Search input + dropdown ────────────────────────────────────
  return (
    <div ref={containerRef} className={styles.root}>
      <div className={`${styles.inputWrap} ${open ? styles.inputWrapOpen : ""}`}>
        <span className={styles.inputIcon} aria-hidden="true">
          {loading
            ? <Icon icon="mdi:loading" width={15} height={15} className={styles.spin} />
            : <Icon icon="mdi:map-marker-outline" width={15} height={15} />}
        </span>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Add location — major city, place…"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-label="Search location"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
        />
      </div>

      {open && results.length > 0 && (
        <ul className={styles.dropdown} role="listbox" aria-label="Location suggestions">
          {results.map((place, i) => (
            <li
              key={place.external_id}
              role="option"
              aria-selected={i === hiIdx}
              className={`${styles.item} ${i === hiIdx ? styles.itemHi : ""}`}
              onMouseDown={e => { e.preventDefault(); handleSelect(place) }}
              onMouseEnter={() => setHiIdx(i)}
            >
              <span className={styles.itemIcon} aria-hidden="true">
                <Icon icon={placeIcon(place.place_type)} width={14} height={14} />
              </span>
              <div className={styles.itemText}>
                <span className={styles.itemName}>{place.name}</span>
                {(place.state || place.country_code) && (
                  <span className={styles.itemMeta}>
                    {[place.state, place.country_code].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className={styles.empty} role="status">
          <Icon icon="mdi:map-search-outline" width={14} height={14} />
          No results for "{query}"
        </div>
      )}
    </div>
  )
}