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
import styles from "./PostLocationPicker.module.css"

// Both are cost rules from docs/PLACES_MIGRATION.md section 3, not UX taste:
// every keystroke that reaches Google is a billed Autocomplete event, and
// one/two-character queries are almost pure noise.
const SEARCH_DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = 3

/** Module-level so useSyncExternalStore doesn't resubscribe on every render. */
const subscribeToNothing = () => () => {}

interface PostLocationPickerProps {
  value: PlaceResult | null
  onChange: (place: PlaceResult | null) => void
  /** Close without changing anything. Required: every caller owns the mount. */
  onClose: () => void
  disabled?: boolean
  /**
   * The actor's own coordinates, used as a 50 km bias centre so nearby grounds
   * rank first. Optional - a search without one is less local, not broken.
   */
  bias?: PlaceBias | null
}

/**
 * Icon per Google place type.
 *
 * Reads the prediction's `types` array rather than a single place_type string:
 * that field now says only "city" or "place" (which picker produced it), while
 * Google's own types are what distinguish a stadium from a district.
 */
function placeIcon(types: string[] | undefined): string {
  const set = new Set(types ?? [])

  if (
    set.has("locality") ||
    set.has("administrative_area_level_3") ||
    set.has("postal_town")
  ) {
    return "mdi:city-variant-outline"
  }

  if (
    set.has("administrative_area_level_1") ||
    set.has("administrative_area_level_2") ||
    set.has("country")
  ) {
    return "mdi:map-outline"
  }

  return "mdi:map-marker-outline"
}

function PostLocationPickerInner({
  value,
  onChange,
  onClose,
  disabled = false,
  bias,
}: PostLocationPickerProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [searched, setSearched] = useState(false)
  const [hiIdx, setHiIdx] = useState(-1)
  /** Set while the Details call for a picked prediction is in flight. */
  const [resolving, setResolving] = useState(false)
  /** Details failed for the selection - the list stays up so you can retry. */
  const [selectError, setSelectError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  /**
   * The search session. Minted lazily and thrown away after a select or a
   * clear; mounting IS opening here, so a fresh screen always starts a fresh
   * session and closing needs no explicit reset.
   *
   * The same token must ride every autocomplete AND the single details call -
   * that is what makes a whole search bill as one session rather than one
   * event per keystroke.
   */
  const sessionRef = useRef<string | null>(null)

  const sessionToken = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = newSessionToken()
    return sessionRef.current
  }, [])

  /**
   * Which request the UI is currently showing. Typing "kann" then "kannur"
   * puts two calls in flight, and nothing promises they land in order —
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
      abortRef.current?.abort()
    }
  }, [])

  const runSearch = useCallback((raw: string) => {
    const q = raw.trim()
    const seq = ++seqRef.current

    // Owns its own timer so every entry point — keystroke, Retry — replaces
    // the pending search rather than racing a second one alongside it. The
    // abort does the same for a request that already left.
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    abortRef.current = null

    setSelectError(null)

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
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const found = await placesProvider.searchPlaces(
          q,
          sessionToken(),
          bias,
          { signal: controller.signal },
        )
        if (seq !== seqRef.current) return
        setResults(found)
        setSearched(true)
      } catch (err) {
        // An abort is this screen replacing its own request — not a failure,
        // and painting one would flash an error on every keystroke.
        if (isAbortError(err) || seq !== seqRef.current) return
        setResults([])
        setFailed(true)
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }, [bias, sessionToken])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    setQuery(next)
    setHiIdx(-1)
    runSearch(next)
  }

  const handleClearQuery = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    abortRef.current = null
    seqRef.current++
    setQuery("")
    setResults([])
    setLoading(false)
    setFailed(false)
    setSearched(false)
    setSelectError(null)
    setResolving(false)
    setHiIdx(-1)
    // Clearing ends the search session: the next search must start a new
    // billed one rather than continue this token's.
    sessionRef.current = null
    inputRef.current?.focus()
  }

  // Select and remove both settle the question this screen was opened to ask,
  // so both return you to the form.
  //
  // Selecting is TWO steps now: a prediction carries no coordinates, so the one
  // Place Details call allowed per search resolves the pick. The screen stays
  // OPEN until that succeeds — on failure you are still looking at the list you
  // chose from and can simply pick again, which is why this does not close
  // optimistically.
  const handleSelect = async (suggestion: PlaceSuggestion) => {
    if (disabled || resolving) return

    // Must be the same token every autocomplete above used: that is what closes
    // the session and makes the whole search bill as one.
    const token = sessionToken()

    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const seq = ++seqRef.current

    setResolving(true)
    setSelectError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const details = await placesProvider.getPlaceDetails(
        suggestion.place_id,
        token,
        { signal: controller.signal },
      )
      if (seq !== seqRef.current) return

      const place = toPlaceResult(suggestion, details, "place")

      if (!place) {
        // Details answered without a point. Storing half a location is worse
        // than asking for another pick.
        setSelectError("Couldn't get that location. Try another.")
        return
      }

      // Selection ends the session.
      sessionRef.current = null
      onChange(place)
      onClose()
    } catch (err) {
      if (isAbortError(err) || seq !== seqRef.current) return
      setSelectError(
        err instanceof PlaceSearchUnavailableError
          ? "Search is unavailable right now. Please try again later."
          : "Couldn't get that location. Try again.",
      )
    } finally {
      if (seq === seqRef.current) setResolving(false)
    }
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
      void handleSelect(results[hiIdx])
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

  const busy = loading || resolving
  const showEmpty =
    !busy && !failed && searched && results.length === 0 &&
    query.trim().length >= MIN_QUERY_LENGTH
  const showHint =
    !busy && !failed && query.trim().length < MIN_QUERY_LENGTH && !results.length

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
            {busy
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
            disabled={disabled || resolving}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="Search location"
            aria-busy={busy}
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
            <>
              {/* Details failed for a pick. Deliberately ABOVE the list it
                  refers to and non-blocking: the list stays live so the next
                  tap is a retry. */}
              {selectError && (
                <p className={styles.selectError} role="alert">
                  <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                  {selectError}
                </p>
              )}

              <ul
                ref={listRef}
                id={`${titleId}-results`}
                className={styles.list}
                role="listbox"
                aria-label="Location results"
              >
                {results.map((place, i) => (
                  <li key={place.place_id || `${place.label}-${i}`} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === hiIdx}
                      className={`${styles.item} ${i === hiIdx ? styles.itemHi : ""}`}
                      onClick={() => void handleSelect(place)}
                      onMouseEnter={() => setHiIdx(i)}
                      disabled={disabled || resolving}
                    >
                      <span className={styles.itemIcon} aria-hidden="true">
                        <Icon icon={placeIcon(place.types)} width={19} height={19} />
                      </span>
                      <span className={styles.itemText}>
                        <span className={styles.itemName}>{place.name}</span>
                        <span className={styles.itemMeta}>
                          {place.secondary || place.label}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Required wherever predictions are shown. */}
              <PoweredByGoogle />
            </>
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
