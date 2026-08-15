"use client"

/**
 * PostLocationPicker — full-screen location search.
 *
 * Used by CreatePostModal, EditPostModal and CreateRecruitmentModal, on both
 * the user side and the org-admin side. The profile/city pickers are a
 * different component (shared/components/LocationPicker) and are untouched.
 *
 * ── Why a page and not a dropdown ────────────────────────────
 *
 * This was an inline combobox whose results opened UPWARD, because it was
 * mounted in the post modal's footer and a downward list would have fallen off
 * the bottom. That constraint cost it everything: a 220px scroll area for
 * six results, a list that overlapped the composer it belonged to, and on a
 * 360px phone the keyboard covered the results as soon as you typed. Search
 * deserves the whole screen — it is the only thing you are doing while it is
 * open.
 *
 * Rendered in a portal on document.body, above the 500-level modal that opened
 * it (and above the 700-level image cropper, which the same modal can open).
 *
 * ── Contract ─────────────────────────────────────────────────
 *
 * Mounting IS opening: the callers already gate this on their own `locationOpen`
 * flag, so there is no `open` prop to keep in sync with theirs. Every exit
 * calls onClose:
 *
 *   pick a place → onChange(place) then onClose()   "select will close and add"
 *   remove       → onChange(null)  then onClose()
 *   back / Esc   → onClose() alone, value untouched
 *
 * onChange fires BEFORE onClose so a caller that unmounts this on close still
 * receives the value.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { searchPlaces, type MapboxPlace } from "@/shared/services/mapbox.service"
import styles from "./PostLocationPicker.module.css"

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2

/** Module-level so useSyncExternalStore doesn't resubscribe on every render. */
const subscribeToNothing = () => () => {}

interface PostLocationPickerProps {
  value: MapboxPlace | null
  onChange: (place: MapboxPlace | null) => void
  /** Close without changing anything. Required: every caller owns the mount. */
  onClose: () => void
  disabled?: boolean
}

/** Icon per Mapbox place_type. */
function placeIcon(type: string): string {
  if (type === "poi") return "mdi:map-marker-outline"
  if (type === "region" || type === "district") return "mdi:map-outline"
  return "mdi:city-variant-outline"
}

function PostLocationPickerInner({
  value,
  onChange,
  onClose,
  disabled = false,
}: PostLocationPickerProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MapboxPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [searched, setSearched] = useState(false)
  const [hiIdx, setHiIdx] = useState(-1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  /**
   * Which request the UI is currently showing. Typing "kann" then "kannur"
   * puts two calls in flight, and Mapbox does not promise they land in order —
   * without this the stale "kann" results can overwrite the ones you asked for
   * last. Only the newest sequence number is allowed to paint.
   */
  const seqRef = useRef(0)

  const titleId = useId()

  // ── Scroll lock ─────────────────────────────────────────────
  // The opener already locked the body; restoring the previous value rather
  // than clearing it is what keeps the modal underneath locked after this
  // closes.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // ── Focus ────────────────────────────────────────────────────
  // The input, not the panel: this screen exists to be typed into, and the
  // mobile keyboard coming up immediately is the point rather than a cost.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  // Any pending debounce dies with the screen — this component is unmounted by
  // its caller the moment a place is picked.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runSearch = useCallback((raw: string) => {
    const q = raw.trim()
    const seq = ++seqRef.current

    // Owns its own timer so every entry point — keystroke, Retry — replaces
    // the pending search rather than racing a second one alongside it.
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (q.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      setFailed(false)
      setSearched(false)
      return
    }

    setLoading(true)
    setFailed(false)

    debounceRef.current = setTimeout(async () => {
      try {
        const found = await searchPlaces(q)
        if (seq !== seqRef.current) return
        setResults(found)
        setSearched(true)
      } catch {
        if (seq !== seqRef.current) return
        setResults([])
        setFailed(true)
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setQuery(next)
    setHiIdx(-1)
    runSearch(next)
  }

  const handleClearQuery = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    seqRef.current++
    setQuery("")
    setResults([])
    setLoading(false)
    setFailed(false)
    setSearched(false)
    setHiIdx(-1)
    inputRef.current?.focus()
  }

  // Select and remove both settle the question this screen was opened to ask,
  // so both return you to the form.
  const handleSelect = (place: MapboxPlace) => {
    if (disabled) return
    onChange(place)
    onClose()
  }

  const handleRemove = () => {
    if (disabled) return
    onChange(null)
    onClose()
  }

  // Escape is handled by the document listener below, which sees it first.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHiIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHiIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && hiIdx >= 0) {
      e.preventDefault()
      handleSelect(results[hiIdx])
    }
  }

  // ── Esc anywhere on the screen ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    // Capture: the modal underneath listens for Escape too, and without this
    // one keypress closes both this screen and the composer behind it.
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [onClose])

  // Keep the keyboard-highlighted row in view on desktop.
  useEffect(() => {
    if (hiIdx < 0) return
    listRef.current?.children[hiIdx]?.scrollIntoView({ block: "nearest" })
  }, [hiIdx])

  const showEmpty =
    !loading && !failed && searched && results.length === 0 &&
    query.trim().length >= MIN_QUERY_LENGTH
  const showHint =
    !loading && !failed && query.trim().length < MIN_QUERY_LENGTH && !results.length

  return createPortal(
    <div className={styles.screen} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={styles.panel}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={onClose}
            aria-label="Close location search"
          >
            <Icon icon="mdi:arrow-left" width={22} height={22} />
          </button>
          <h2 id={titleId} className={styles.title}>Add location</h2>
        </div>

        {/* ── Search field ── */}
        <div className={styles.searchRow}>
          <span className={styles.searchIcon} aria-hidden="true">
            {loading
              ? <Icon icon="mdi:loading" width={18} height={18} className={styles.spin} />
              : <Icon icon="mdi:magnify" width={18} height={18} />}
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search city, area or place…"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="Search location"
            aria-controls={`${titleId}-results`}
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClearQuery}
              aria-label="Clear search"
            >
              <Icon icon="mdi:close-circle" width={18} height={18} />
            </button>
          )}
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>

          {/* Current selection — the only place remove lives now that the
              screen replaced the inline pill. Callers keep their own pill in
              the form; this one is for when you reopen with a value set. */}
          {value && (
            <div className={styles.current}>
              <span className={styles.currentLabel}>Current</span>
              <div className={styles.currentRow}>
                <span className={styles.currentIcon} aria-hidden="true">
                  <Icon icon="mdi:map-marker" width={18} height={18} />
                </span>
                <div className={styles.currentText}>
                  <span className={styles.currentName}>{value.name}</span>
                  {(value.state || value.country_code) && (
                    <span className={styles.currentMeta}>
                      {[value.state, value.country_code].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={handleRemove}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <ul
              ref={listRef}
              id={`${titleId}-results`}
              className={styles.list}
              role="listbox"
              aria-label="Location results"
            >
              {results.map((place, i) => (
                <li key={place.external_id || `${place.label}-${i}`} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === hiIdx}
                    className={`${styles.item} ${i === hiIdx ? styles.itemHi : ""}`}
                    onClick={() => handleSelect(place)}
                    onMouseEnter={() => setHiIdx(i)}
                    disabled={disabled}
                  >
                    <span className={styles.itemIcon} aria-hidden="true">
                      <Icon icon={placeIcon(place.place_type)} width={19} height={19} />
                    </span>
                    <span className={styles.itemText}>
                      <span className={styles.itemName}>{place.name}</span>
                      <span className={styles.itemMeta}>
                        {[place.state, place.country_code].filter(Boolean).join(", ") ||
                          place.label}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Three different dead ends, three different next actions. */}
          {showHint && (
            <div className={styles.state}>
              <Icon icon="mdi:map-search-outline" width={34} height={34} />
              <p className={styles.stateTitle}>Search for a location</p>
              <p className={styles.stateBody}>
                Type at least {MIN_QUERY_LENGTH} letters — a city, an area or a
                ground.
              </p>
            </div>
          )}

          {showEmpty && (
            <div className={styles.state} role="status">
              <Icon icon="mdi:map-marker-off-outline" width={34} height={34} />
              <p className={styles.stateTitle}>No places found</p>
              <p className={styles.stateBody}>
                Nothing matches &ldquo;{query.trim()}&rdquo;. Try a nearby town or
                a shorter name.
              </p>
            </div>
          )}

          {failed && (
            <div className={styles.state} role="alert">
              <Icon icon="mdi:wifi-off" width={34} height={34} />
              <p className={styles.stateTitle}>Couldn&rsquo;t search</p>
              <p className={styles.stateBody}>
                Check your connection and try again.
              </p>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => runSearch(query)}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function PostLocationPicker(props: PostLocationPickerProps) {
  // createPortal needs `document`, so nothing may render on the server pass.
  // useSyncExternalStore (rather than a mounted flag set in an effect) gets
  // this without a cascading render: false through SSR + hydration, true after.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )

  if (!mounted) return null

  return <PostLocationPickerInner {...props} />
}
