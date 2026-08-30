"use client"

import { useEffect, useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import Select from "@/shared/components/ui/Select/Select"
import LocationPicker from "@/shared/components/LocationPicker/LocationPicker"
import { useSportPositions } from "@/features/profile/hooks/useSportsQueries"
import type { Sport } from "@/features/profile/services/sports.api"
import type { PlaceResult } from "@/shared/services/places.service"
import styles from "./ExploreListFilters.module.css"

// ── Values (URL-synced by the page) ───────────────────────────

export type ExploreFilterValues = {
  sportId: string
  positionId: string
  cityLabel: string
  lat: string
  lng: string
  radius: string
}

export const EMPTY_FILTER_VALUES: ExploreFilterValues = {
  sportId: "",
  positionId: "",
  cityLabel: "",
  lat: "",
  lng: "",
  radius: "",
}

export const DEFAULT_RADIUS = "50"

const RADIUS_OPTIONS = [
  { value: "25", label: "25 km" },
  { value: "50", label: "50 km" },
  { value: "100", label: "100 km" },
  { value: "200", label: "200 km" },
]

// A PlaceResult reconstructed from the flat URL values (for LocationPicker).
//
// The URL carries a label and a point and nothing else, so there is no place id
// to recover — `external_id` stays the "committed" sentinel it has always been.
// That is fine here and only here: this value is never sent to a write endpoint,
// it only re-renders the picker's pill from a shareable URL.
function toCity(v: ExploreFilterValues): PlaceResult | null {
  if (!v.cityLabel || !v.lat || !v.lng) return null
  return {
    provider: "google",
    place_type: "city",
    label: v.cityLabel,
    name: v.cityLabel,
    city: v.cityLabel,
    state: "",
    country: "",
    country_code: "",
    latitude: Number(v.lat),
    longitude: Number(v.lng),
    external_id: "committed",
    types: [],
  }
}

function cityPatch(city: PlaceResult | null, radius: string): Partial<ExploreFilterValues> {
  if (!city) return { cityLabel: "", lat: "", lng: "", radius: "" }
  return {
    cityLabel: city.label,
    lat: String(city.latitude),
    lng: String(city.longitude),
    radius: radius || DEFAULT_RADIUS,
  }
}

// ── Position select (positions fetched per sport) ─────────────

function PositionSelect({
  sportId,
  value,
  onChange,
}: {
  sportId: string
  value: string
  onChange: (v: string) => void
}) {
  const { data: positions = [] } = useSportPositions(sportId)
  const options = useMemo(
    () => [
      { value: "", label: "Any position" },
      ...positions.map((p) => ({ value: p.id, label: p.name })),
    ],
    [positions]
  )

  return (
    <Select
      options={options}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!sportId}
      aria-label="Filter by position"
      helperText={!sportId ? "Select a sport first" : undefined}
    />
  )
}

// ── Filters ───────────────────────────────────────────────────

interface ExploreListFiltersProps {
  showPosition: boolean
  sports: Sport[]
  values: ExploreFilterValues
  /** Commit a patch to the applied (URL) filters. */
  onChange: (patch: Partial<ExploreFilterValues>) => void
  onClearAll: () => void
  /** Active chip count (sport / position / location). */
  activeCount: number
}

export default function ExploreListFilters({
  showPosition,
  sports,
  values,
  onChange,
  onClearAll,
  activeCount,
}: ExploreListFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<ExploreFilterValues>(values)

  const openSheet = () => {
    setDraft(values)
    setSheetOpen(true)
  }
  const closeSheet = () => setSheetOpen(false)

  // Body-scroll lock + Escape close while the sheet is open.
  useEffect(() => {
    if (!sheetOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [sheetOpen])

  const sportOptions = useMemo(
    () => [
      { value: "", label: "All sports" },
      ...sports.map((s) => ({ value: s.id, label: s.name })),
    ],
    [sports]
  )

  // Position name for the chip (positions of the applied sport).
  const { data: appliedPositions = [] } = useSportPositions(values.sportId)

  const patchDraft = (patch: Partial<ExploreFilterValues>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const applySheet = () => {
    onChange(draft)
    setSheetOpen(false)
  }
  const clearSheet = () => setDraft(EMPTY_FILTER_VALUES)

  // ── Chips ────────────────────────────────────────────────────
  const chips: { key: "sport" | "position" | "location"; label: string }[] = []
  if (values.sportId) {
    chips.push({
      key: "sport",
      label: sports.find((s) => s.id === values.sportId)?.name ?? "Sport",
    })
  }
  if (showPosition && values.positionId) {
    chips.push({
      key: "position",
      label:
        appliedPositions.find((p) => p.id === values.positionId)?.name ??
        "Position",
    })
  }
  if (values.cityLabel) {
    chips.push({
      key: "location",
      label: `${values.cityLabel}${values.radius ? ` · ${values.radius} km` : ""}`,
    })
  }

  const removeChip = (key: "sport" | "position" | "location") => {
    if (key === "sport") onChange({ sportId: "", positionId: "" })
    else if (key === "position") onChange({ positionId: "" })
    else onChange({ cityLabel: "", lat: "", lng: "", radius: "" })
  }

  // ── Reusable control blocks (shared by desktop bar + sheet) ──
  const renderSportControl = (
    v: ExploreFilterValues,
    apply: (patch: Partial<ExploreFilterValues>) => void
  ) => (
    <Select
      options={sportOptions}
      value={v.sportId}
      // Changing the sport always clears the position.
      onChange={(e) => apply({ sportId: e.target.value, positionId: "" })}
      aria-label="Filter by sport"
    />
  )

  return (
    <div className={styles.filters}>
      {/* ── Desktop inline bar ── */}
      <div className={styles.desktopBar}>
        <div className={styles.field}>{renderSportControl(values, onChange)}</div>

        {showPosition && (
          <div className={styles.field}>
            <PositionSelect
              sportId={values.sportId}
              value={values.positionId}
              onChange={(positionId) => onChange({ positionId })}
            />
          </div>
        )}

        <div className={styles.locationField}>
          <LocationPicker
            value={toCity(values)}
            onChange={(city) => onChange(cityPatch(city, values.radius))}
            placeholder="Any location"
          />
        </div>

        {values.cityLabel && (
          <div className={styles.radiusField}>
            <Select
              options={RADIUS_OPTIONS}
              value={values.radius || DEFAULT_RADIUS}
              onChange={(e) => onChange({ radius: e.target.value })}
              aria-label="Search radius"
            />
          </div>
        )}
      </div>

      {/* ── Mobile: Filters button ── */}
      <div className={styles.mobileBar}>
        <button
          type="button"
          className={styles.filtersBtn}
          onClick={openSheet}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          aria-label={`Filters${activeCount ? `, ${activeCount} active` : ""}`}
        >
          <Icon icon="mdi:tune-variant" width={18} height={18} />
          Filters
          {activeCount > 0 && <span className={styles.filtersBadge}>{activeCount}</span>}
        </button>
      </div>

      {/* ── Active-filter chips ── */}
      {chips.length > 0 && (
        <div className={styles.chips}>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={styles.chip}
              onClick={() => removeChip(chip.key)}
              aria-label={`Remove filter: ${chip.label}`}
            >
              <span>{chip.label}</span>
              <Icon icon="mdi:close" width={13} height={13} />
            </button>
          ))}
          <button type="button" className={styles.clearAll} onClick={onClearAll}>
            Clear all
          </button>
        </div>
      )}

      {/* ── Mobile bottom sheet ── */}
      {sheetOpen && (
        <div className={styles.sheetBackdrop} onClick={closeSheet} role="presentation">
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>Filters</h2>
              <button
                type="button"
                className={styles.sheetClose}
                onClick={closeSheet}
                aria-label="Close filters"
              >
                <Icon icon="mdi:close" width={20} height={20} />
              </button>
            </div>

            <div className={styles.sheetBody}>
              <div className={styles.sheetField}>
                <span className={styles.sheetLabel}>Sport</span>
                {renderSportControl(draft, patchDraft)}
              </div>

              {showPosition && (
                <div className={styles.sheetField}>
                  <span className={styles.sheetLabel}>Position</span>
                  <PositionSelect
                    sportId={draft.sportId}
                    value={draft.positionId}
                    onChange={(positionId) => patchDraft({ positionId })}
                  />
                </div>
              )}

              <div className={styles.sheetField}>
                <span className={styles.sheetLabel}>Location</span>
                <LocationPicker
                  value={toCity(draft)}
                  onChange={(city) => patchDraft(cityPatch(city, draft.radius))}
                  placeholder="Any location"
                />
              </div>

              {draft.cityLabel && (
                <div className={styles.sheetField}>
                  <span className={styles.sheetLabel}>Radius</span>
                  <Select
                    options={RADIUS_OPTIONS}
                    value={draft.radius || DEFAULT_RADIUS}
                    onChange={(e) => patchDraft({ radius: e.target.value })}
                    aria-label="Search radius"
                  />
                </div>
              )}
            </div>

            <div className={styles.sheetActions}>
              <button type="button" className={styles.sheetClear} onClick={clearSheet}>
                Clear
              </button>
              <button type="button" className={styles.sheetApply} onClick={applySheet}>
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
