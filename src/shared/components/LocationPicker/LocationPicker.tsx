"use client"

/**
 * LocationPicker
 *
 * Reusable city-search input backed by the Goatza places proxy (Google Places
 * New, server-side). Shows a dropdown of matching cities; selecting one fetches
 * its details and calls onChange with a full PlaceResult.
 * Never exposes lat/lng to the user — only the human-readable label.
 *
 * Usage:
 *   <LocationPicker
 *     value={selectedCity}     // PlaceResult | null
 *     onChange={setSelectedCity}
 *     placeholder="Search city…"
 *   />
 *
 * To use in post context, just mount it in any form — it's stateless.
 *
 * ── What the provider swap added ──────────────────────────────
 *
 * Autocomplete predictions carry NO coordinates, so selecting is now two steps:
 * a prediction is picked, then one Place Details call resolves it. Everything
 * below follows from that plus the cost rules in docs/PLACES_MIGRATION.md
 * section 3:
 *
 *   * **3 characters minimum, 400 ms debounce.** Every keystroke that reaches
 *     Google is a billed event, and one- and two-character queries are noise.
 *   * **One session token per search session.** The same UUID goes on every
 *     autocomplete AND on the details call, which is what makes a whole search
 *     bill as one session instead of one event per keystroke. A new token is
 *     minted after a select, a clear or a close — reusing one across sessions
 *     is a billing error, not a tidiness one.
 *   * **Stale responses are dropped and in-flight ones aborted.** Typing "kann"
 *     then "kannur" puts two calls in flight and nothing promises they land in
 *     order; without the sequence guard the older answer can overwrite the
 *     newer. (PostLocationPicker has always had this; the city picker did not.)
 *   * **Attribution.** "Powered by Google" renders under the results whenever
 *     predictions are on screen.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import {
  isAbortError,
  newSessionToken,
  placesProvider,
  PlaceSearchUnavailableError,
  toPlaceResult,
  type PlaceBias,
  type PlaceResult,
  type PlaceSuggestion,
} from "@/shared/services/places.service"
import PoweredByGoogle from "@/shared/components/PoweredByGoogle/PoweredByGoogle"
import styles from "./LocationPicker.module.css"

// Cost rules, not UX preferences — see the header.
const MIN_QUERY_LENGTH = 3
const SEARCH_DEBOUNCE_MS = 400

// ── Props ─────────────────────────────────────────────────────

interface LocationPickerProps {
  /** Currently selected city (null = nothing selected) */
  value: PlaceResult | null
  onChange: (city: PlaceResult | null) => void
  placeholder?: string
  disabled?: boolean
  /** Show clear button even when disabled */
  clearable?: boolean
  /** Error message from parent form */
  error?: string
  /**
   * Id for the search input, so a caller that renders its own visible <label
   * htmlFor> is actually associated with it.
   *
   * Passing it also DROPS the built-in `aria-label`: an aria-label wins over a
   * <label>, so leaving it on would announce "Search location" and silence the
   * caller's wording. Without this prop nothing changes for existing callers.
   */
  inputId?: string
  /**
   * The actor's own coordinates, used as a 50 km bias centre so nearby towns
   * rank first. Optional everywhere — the anonymous /join page has none, and a
   * search without a bias is merely less local, not broken.
   */
  bias?: PlaceBias | null
}

// ── Component ─────────────────────────────────────────────────

export default function LocationPicker({
  value,
  onChange,
  placeholder = "Search city…",
  disabled = false,
  clearable = true,
  error,
  inputId,
  bias,
}: LocationPickerProps) {
  const [query,   setQuery]   = useState("")
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  /** Set while the Details call for a picked prediction is in flight. */
  const [resolving, setResolving] = useState(false)

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)

  /**
   * Which request the UI is currently showing. Only the newest sequence number
   * is allowed to paint — see the header note on out-of-order responses.
   */
  const seqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  /** Ties the combobox to its listbox for screen readers. */
  const listId = useId()

  /**
   * The current search session. Lazily minted so merely mounting the picker
   * (every profile form does) does not start a session, and replaced on every
   * select / clear / close.
   */
  const sessionRef = useRef<string | null>(null)

  const sessionToken = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = newSessionToken()
    return sessionRef.current
  }, [])

  const endSession = useCallback(() => {
    sessionRef.current = null
  }, [])

  /** Drop anything in flight and stop its answer from painting. */
  const cancelInFlight = useCallback(() => {
    seqRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  // ── Close dropdown on outside click ──────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Closing ends the search session: the next one must not be billed as
        // a continuation of this one.
        endSession()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [endSession])

  // Nothing may resolve after this picker goes away.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  // ── Keep the list on screen when it opens ─────────────────────
  //
  // On a phone the keyboard takes roughly the bottom half of the screen the
  // moment this input is focused. A field sitting low in the form then drops
  // its suggestions below the fold, where they are reachable only by scrolling
  // a list the user cannot see. `block: "nearest"` scrolls the minimum needed
  // and does nothing at all when the list is already visible, so this is inert
  // on a desktop and on every field near the top of a form.
  //
  // Called optionally: jsdom does not implement scrollIntoView, and this is an
  // enhancement rather than a requirement — without it the list is still there,
  // still open and still selectable, just not scrolled to.
  useEffect(() => {
    if (!open || results.length === 0) return
    listRef.current?.scrollIntoView?.({ block: "nearest" })
  }, [open, results.length])

  // ── Debounced search ──────────────────────────────────────────
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setFetchError(null)

    cancelInFlight()
    const seq = seqRef.current

    if (q.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const found = await placesProvider.searchCities(
          q,
          sessionToken(),
          bias,
          { signal: controller.signal },
        )
        if (seq !== seqRef.current) return
        setResults(found)
        setOpen(true)
      } catch (err) {
        // An abort is this component replacing its own request; it is not a
        // failure and must not paint one.
        if (isAbortError(err) || seq !== seqRef.current) return
        setFetchError(
          err instanceof PlaceSearchUnavailableError
            ? "Search is unavailable right now. Please try again later."
            : "Couldn't load suggestions.",
        )
        setResults([])
        setOpen(false)
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [bias, cancelInFlight, sessionToken])

  // ── Select a city ─────────────────────────────────────────────
  //
  // Two steps now: the prediction the user clicked carries no coordinates, so
  // one Details call resolves it. The list is deliberately LEFT OPEN until that
  // succeeds — if it fails, the user is still looking at the list they picked
  // from and can simply pick again.
  const handleSelect = async (suggestion: PlaceSuggestion) => {
    if (resolving) return

    // The details call closes the session this token opened, so it must be the
    // SAME token every autocomplete above used.
    const token = sessionToken()

    // Only the details request may paint from here on.
    cancelInFlight()
    const seq = seqRef.current

    setResolving(true)
    setFetchError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const details = await placesProvider.getPlaceDetails(
        suggestion.place_id,
        token,
        { signal: controller.signal },
      )
      if (seq !== seqRef.current) return

      const place = toPlaceResult(suggestion, details, "city")

      if (!place) {
        // Details answered without coordinates. Storing half a location is
        // worse than asking for another pick.
        setFetchError("Couldn't get that location. Try another.")
        return
      }

      onChange(place)
      setQuery("")
      setResults([])
      setOpen(false)
      // Selection ends the session — the next search starts a new billed one.
      endSession()
    } catch (err) {
      if (isAbortError(err) || seq !== seqRef.current) return
      setFetchError(
        err instanceof PlaceSearchUnavailableError
          ? "Search is unavailable right now. Please try again later."
          : "Couldn't get that location. Try again.",
      )
    } finally {
      if (seq === seqRef.current) setResolving(false)
    }
  }

  // ── Clear ─────────────────────────────────────────────────────
  const handleClear = () => {
    cancelInFlight()
    onChange(null)
    setQuery("")
    setResults([])
    setOpen(false)
    setFetchError(null)
    setLoading(false)
    setResolving(false)
    endSession()
    inputRef.current?.focus()
  }

  // ── Keyboard nav ──────────────────────────────────────────────
  const [highlightIdx, setHighlightIdx] = useState(-1)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      endSession()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault()
      void handleSelect(results[highlightIdx])
    }
  }

  const isSelected = !!value
  const busy = loading || resolving

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
            {busy
              ? <Icon icon="mdi:loading" width={16} height={16} className={styles.spin} />
              : <Icon icon="mdi:map-marker-outline" width={16} height={16} />}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className={styles.input}
            placeholder={placeholder}
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setOpen(true)}
            disabled={disabled || resolving}
            autoComplete="off"
            spellCheck={false}
            aria-label={inputId ? undefined : "Search location"}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-busy={busy}
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
        <div className={styles.dropdown}>
          <ul
            ref={listRef}
            id={listId}
            className={styles.dropdownList}
            role="listbox"
            aria-label="Location suggestions"
          >
            {results.map((city, i) => (
              <li
                key={city.place_id}
                role="option"
                aria-selected={i === highlightIdx}
                className={`${styles.dropdownItem} ${i === highlightIdx ? styles.dropdownItemHighlight : ""}`}
                onMouseDown={(e) => { e.preventDefault(); void handleSelect(city) }}
                onMouseEnter={() => setHighlightIdx(i)}
              >
                <span className={styles.dropdownIcon} aria-hidden="true">
                  <Icon icon="mdi:city-variant-outline" width={14} height={14} />
                </span>
                <span className={styles.dropdownLabel}>{city.label}</span>
              </li>
            ))}
          </ul>

          {/* Required wherever predictions are shown. */}
          <PoweredByGoogle />
        </div>
      )}

      {/* Empty state */}
      {open && !busy && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && !fetchError && (
        <div className={styles.dropdownEmpty}>
          <Icon icon="mdi:map-search-outline" width={16} height={16} />
          No places found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
