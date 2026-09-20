"use client"

import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import type { Sport, SportPosition } from "@/features/profile/services/sports.api"
import { useSportPositions } from "@/features/profile/hooks/useSportsQueries"
import {
  RECRUITMENT_TYPE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  DISTANCE_OPTIONS,
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilters,
} from "../../filterOptions"
import Select from "@/shared/components/ui/Select/Select"
import styles from "./RecruitmentFilters.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"

type TextKey = "search" | "city" | "birthYear"

interface RecruitmentFiltersProps {
  /** Live working copy that drives the desktop bar controls. */
  draft: DiscoveryFilters
  /** Applied filters — drives the chips + the mobile sheet's opening state. */
  committed: DiscoveryFilters
  sports: Sport[]
  /** Count of active chip-filters (everything except the search box). */
  activeCount: number
  /**
   * False when the viewer has no coordinates on file. The distance filter is
   * hidden rather than disabled: an enabled control that silently returns
   * nothing is worse than one that isn't offered.
   */
  canFilterByDistance?: boolean
  onTextChange: (patch: Partial<Pick<DiscoveryFilters, TextKey>>) => void
  onSelectChange: (patch: Partial<DiscoveryFilters>) => void
  onApplyAll: (next: DiscoveryFilters) => void
  onRemoveChip: (key: keyof DiscoveryFilters) => void
  onClearAll: () => void
}

// ── Active-filter chips ───────────────────────────────────────

type Chip = { key: keyof DiscoveryFilters; label: string }

function buildChips(
  f: DiscoveryFilters,
  sports: Sport[],
  positions: SportPosition[]
): Chip[] {
  const chips: Chip[] = []
  if (f.sport_id) {
    const name = sports.find((s) => s.id === f.sport_id)?.name ?? "Sport"
    chips.push({ key: "sport_id", label: name })
  }
  if (f.positionId) {
    const name = positions.find((p) => p.id === f.positionId)?.name ?? "Position"
    chips.push({ key: "positionId", label: name })
  }
  if (f.recruitment_type) {
    const label =
      RECRUITMENT_TYPE_OPTIONS.find((o) => o.value === f.recruitment_type)
        ?.label ?? f.recruitment_type
    chips.push({ key: "recruitment_type", label })
  }
  if (f.city) chips.push({ key: "city", label: `City: ${f.city}` })
  if (f.distanceKm) {
    chips.push({ key: "distanceKm", label: `Within ${f.distanceKm} km` })
  }
  if (f.experience_level) {
    const label =
      EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === f.experience_level)
        ?.label ?? f.experience_level
    chips.push({ key: "experience_level", label: `Level: ${label}` })
  }
  if (f.birthYear) chips.push({ key: "birthYear", label: `Birth year: ${f.birthYear}` })
  if (f.closingWithinDays) {
    chips.push({
      key: "closingWithinDays",
      label: `Closing in ${f.closingWithinDays} days`,
    })
  }
  if (f.publishedWithinDays) {
    chips.push({
      key: "publishedWithinDays",
      label: `Posted in last ${f.publishedWithinDays} days`,
    })
  }
  if (f.forMe) chips.push({ key: "forMe", label: "My age group" })
  if (f.goatza) chips.push({ key: "goatza", label: "Apply via Goatza" })
  return chips
}

export default function RecruitmentFilters({
  draft,
  committed,
  sports,
  activeCount,
  canFilterByDistance = true,
  onTextChange,
  onSelectChange,
  onApplyAll,
  onRemoveChip,
  onClearAll,
}: RecruitmentFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDraft, setSheetDraft] = useState<DiscoveryFilters>(committed)

  // Seed the sheet from the currently-applied filters each time it opens.
  const openSheet = () => {
    setSheetDraft(committed)
    setSheetOpen(true)
  }
  const closeSheet = () => setSheetOpen(false)

  // Lock body scroll + close on Escape while the sheet is open.
  useBodyScrollLock(sheetOpen)

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
    }
  }, [sheetOpen])

  // Positions only exist inside a sport. Two lookups: the desktop/sheet select
  // follows whichever sport is being edited, the chips follow what is applied.
  const { data: draftPositions = [] } = useSportPositions(draft.sport_id)
  const { data: sheetPositions = [] } = useSportPositions(sheetDraft.sport_id)
  const { data: committedPositions = [] } = useSportPositions(committed.sport_id)

  const patchSheet = (patch: Partial<DiscoveryFilters>) =>
    // Changing sport invalidates the position under it — same rule the URL
    // commit path applies.
    setSheetDraft((d) => ({
      ...d,
      ...patch,
      ...("sport_id" in patch ? { positionId: "" } : {}),
    }))

  const applySheet = () => {
    onApplyAll(sheetDraft)
    setSheetOpen(false)
  }

  const clearSheet = () =>
    // Reset the sheet fields but keep whatever is in the (separate) search box.
    setSheetDraft((d) => ({ ...EMPTY_DISCOVERY_FILTERS, search: d.search }))

  const chips = buildChips(committed, sports, committedPositions)

  return (
    <div className={styles.filters}>
      {/* ── Desktop: full horizontal bar ── */}
      <div className={styles.desktopBar}>
        <label className={styles.searchField}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon icon="mdi:magnify" width={18} height={18} />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search recruitments…"
            value={draft.search}
            onChange={(e) => onTextChange({ search: e.target.value })}
            aria-label="Search recruitments"
          />
        </label>

        <Select
          className={styles.fieldSelect}
          size="sm"
          value={draft.sport_id}
          onChange={(sport_id) => onSelectChange({ sport_id })}
          aria-label="Filter by sport"
          sheetTitle="Sport"
          options={[
            { value: "", label: "All sports" },
            ...sports.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />

        <Select
          className={styles.fieldSelect}
          size="sm"
          searchable={false}
          value={draft.recruitment_type}
          onChange={(value) =>
            onSelectChange({
              recruitment_type: value as DiscoveryFilters["recruitment_type"],
            })
          }
          aria-label="Filter by recruitment type"
          sheetTitle="Recruitment type"
          options={[
            { value: "", label: "All types" },
            ...RECRUITMENT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />

        <Select
          className={styles.fieldSelect}
          size="sm"
          value={draft.positionId}
          onChange={(positionId) => onSelectChange({ positionId })}
          disabled={!draft.sport_id}
          aria-label="Filter by position"
          sheetTitle="Position"
          options={[
            {
              value: "",
              label: draft.sport_id ? "Any position" : "Pick a sport first",
            },
            ...draftPositions.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />

        <input
          type="text"
          className={styles.fieldInput}
          placeholder="City"
          value={draft.city}
          onChange={(e) => onTextChange({ city: e.target.value })}
          aria-label="Filter by city"
        />

        {canFilterByDistance && (
          <Select
            className={styles.fieldSelect}
            size="sm"
            searchable={false}
            value={draft.distanceKm}
            onChange={(distanceKm) => onSelectChange({ distanceKm })}
            aria-label="Filter by distance"
            sheetTitle="Distance"
            options={[
              { value: "", label: "Any distance" },
              ...DISTANCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
        )}

        <Select
          className={styles.fieldSelect}
          size="sm"
          searchable={false}
          value={draft.experience_level}
          onChange={(experience_level) => onSelectChange({ experience_level })}
          aria-label="Filter by experience level"
          sheetTitle="Experience level"
          options={[
            { value: "", label: "Any level" },
            ...EXPERIENCE_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />

        <input
          type="number"
          inputMode="numeric"
          className={`${styles.fieldInput} ${styles.fieldInputNarrow}`}
          placeholder="Birth year"
          value={draft.birthYear}
          onChange={(e) => onTextChange({ birthYear: e.target.value })}
          aria-label="Filter by birth year"
        />

        {/* "For me" narrows to the viewer's own age group — and only that.
            It is opt-in because eligibility otherwise only ranks, never
            filters. A player with no date of birth keeps everything. */}
        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={draft.forMe}
            onChange={(e) => onSelectChange({ forMe: e.target.checked })}
          />
          <span>My age group</span>
        </label>

        <label className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={draft.goatza}
            onChange={(e) => onSelectChange({ goatza: e.target.checked })}
          />
          <span>Apply via Goatza</span>
        </label>
      </div>

      {/* ── Mobile: search + Filters button ── */}
      <div className={styles.mobileBar}>
        <label className={styles.searchField}>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon icon="mdi:magnify" width={18} height={18} />
          </span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search recruitments…"
            value={draft.search}
            onChange={(e) => onTextChange({ search: e.target.value })}
            aria-label="Search recruitments"
          />
        </label>

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
              onClick={() => onRemoveChip(chip.key)}
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
        <div
          className={styles.sheetBackdrop}
          onClick={closeSheet}
          role="presentation"
        >
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="Filter recruitments"
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
                <label className={styles.sheetLabel} htmlFor="sheet-sport">
                  Sport
                </label>
                <Select
                  id="sheet-sport"
                  className={styles.fieldSelect}
                  value={sheetDraft.sport_id}
                  onChange={(sport_id) => patchSheet({ sport_id })}
                  sheetTitle="Sport"
                  options={[
                    { value: "", label: "All sports" },
                    ...sports.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-position">
                  Position
                </label>
                <Select
                  id="sheet-position"
                  className={styles.fieldSelect}
                  value={sheetDraft.positionId}
                  onChange={(positionId) => patchSheet({ positionId })}
                  disabled={!sheetDraft.sport_id}
                  sheetTitle="Position"
                  options={[
                    {
                      value: "",
                      label: sheetDraft.sport_id ? "Any position" : "Pick a sport first",
                    },
                    ...sheetPositions.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-type">
                  Recruitment type
                </label>
                <Select
                  id="sheet-type"
                  className={styles.fieldSelect}
                  searchable={false}
                  value={sheetDraft.recruitment_type}
                  onChange={(value) =>
                    patchSheet({
                      recruitment_type: value as DiscoveryFilters["recruitment_type"],
                    })
                  }
                  sheetTitle="Recruitment type"
                  options={[
                    { value: "", label: "All types" },
                    ...RECRUITMENT_TYPE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                />
              </div>

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-city">
                  City
                </label>
                <input
                  id="sheet-city"
                  type="text"
                  className={styles.fieldInput}
                  placeholder="Any city"
                  value={sheetDraft.city}
                  onChange={(e) => patchSheet({ city: e.target.value })}
                />
              </div>

              {canFilterByDistance && (
                <div className={styles.sheetField}>
                  <label className={styles.sheetLabel} htmlFor="sheet-distance">
                    Distance
                  </label>
                  <Select
                    id="sheet-distance"
                    className={styles.fieldSelect}
                    searchable={false}
                    value={sheetDraft.distanceKm}
                    onChange={(distanceKm) => patchSheet({ distanceKm })}
                    sheetTitle="Distance"
                    options={[
                      { value: "", label: "Any distance" },
                      ...DISTANCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                    ]}
                  />
                </div>
              )}

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-experience">
                  Experience level
                </label>
                <Select
                  id="sheet-experience"
                  className={styles.fieldSelect}
                  searchable={false}
                  value={sheetDraft.experience_level}
                  onChange={(experience_level) => patchSheet({ experience_level })}
                  sheetTitle="Experience level"
                  options={[
                    { value: "", label: "Any level" },
                    ...EXPERIENCE_LEVEL_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                />
              </div>

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-birth">
                  Birth year
                </label>
                <input
                  id="sheet-birth"
                  type="number"
                  inputMode="numeric"
                  className={styles.fieldInput}
                  placeholder="e.g. 2008"
                  value={sheetDraft.birthYear}
                  onChange={(e) => patchSheet({ birthYear: e.target.value })}
                />
              </div>

              <label className={styles.sheetCheckbox}>
                <input
                  type="checkbox"
                  checked={sheetDraft.forMe}
                  onChange={(e) => patchSheet({ forMe: e.target.checked })}
                />
                <span>Only trials open to my age group</span>
              </label>

              <label className={styles.sheetCheckbox}>
                <input
                  type="checkbox"
                  checked={sheetDraft.goatza}
                  onChange={(e) => patchSheet({ goatza: e.target.checked })}
                />
                <span>Only recruitments you can apply to via Goatza</span>
              </label>
            </div>

            <div className={styles.sheetActions}>
              <button
                type="button"
                className={styles.sheetClear}
                onClick={clearSheet}
              >
                Clear
              </button>
              <button
                type="button"
                className={styles.sheetApply}
                onClick={applySheet}
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
