"use client"

import { useEffect, useState } from "react"
import { Icon } from "@iconify/react"
import type { Sport } from "@/features/profile/services/sports.api"
import {
  RECRUITMENT_TYPE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilters,
} from "../../filterOptions"
import styles from "./RecruitmentFilters.module.css"

type TextKey = "search" | "city" | "birthYear"

interface RecruitmentFiltersProps {
  /** Live working copy that drives the desktop bar controls. */
  draft: DiscoveryFilters
  /** Applied filters — drives the chips + the mobile sheet's opening state. */
  committed: DiscoveryFilters
  sports: Sport[]
  /** Count of active chip-filters (everything except the search box). */
  activeCount: number
  onTextChange: (patch: Partial<Pick<DiscoveryFilters, TextKey>>) => void
  onSelectChange: (patch: Partial<DiscoveryFilters>) => void
  onApplyAll: (next: DiscoveryFilters) => void
  onRemoveChip: (key: keyof DiscoveryFilters) => void
  onClearAll: () => void
}

// ── Active-filter chips ───────────────────────────────────────

type Chip = { key: keyof DiscoveryFilters; label: string }

function buildChips(f: DiscoveryFilters, sports: Sport[]): Chip[] {
  const chips: Chip[] = []
  if (f.sport_id) {
    const name = sports.find((s) => s.id === f.sport_id)?.name ?? "Sport"
    chips.push({ key: "sport_id", label: name })
  }
  if (f.recruitment_type) {
    const label =
      RECRUITMENT_TYPE_OPTIONS.find((o) => o.value === f.recruitment_type)
        ?.label ?? f.recruitment_type
    chips.push({ key: "recruitment_type", label })
  }
  if (f.city) chips.push({ key: "city", label: `City: ${f.city}` })
  if (f.experience_level) {
    const label =
      EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === f.experience_level)
        ?.label ?? f.experience_level
    chips.push({ key: "experience_level", label: `Level: ${label}` })
  }
  if (f.birthYear) chips.push({ key: "birthYear", label: `Birth year: ${f.birthYear}` })
  if (f.goatza) chips.push({ key: "goatza", label: "Apply via Goatza" })
  return chips
}

export default function RecruitmentFilters({
  draft,
  committed,
  sports,
  activeCount,
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

  const patchSheet = (patch: Partial<DiscoveryFilters>) =>
    setSheetDraft((d) => ({ ...d, ...patch }))

  const applySheet = () => {
    onApplyAll(sheetDraft)
    setSheetOpen(false)
  }

  const clearSheet = () =>
    // Reset the sheet fields but keep whatever is in the (separate) search box.
    setSheetDraft((d) => ({ ...EMPTY_DISCOVERY_FILTERS, search: d.search }))

  const chips = buildChips(committed, sports)

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

        <select
          className={styles.fieldSelect}
          value={draft.sport_id}
          onChange={(e) => onSelectChange({ sport_id: e.target.value })}
          aria-label="Filter by sport"
        >
          <option value="">All sports</option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          className={styles.fieldSelect}
          value={draft.recruitment_type}
          onChange={(e) =>
            onSelectChange({
              recruitment_type: e.target.value as DiscoveryFilters["recruitment_type"],
            })
          }
          aria-label="Filter by recruitment type"
        >
          <option value="">All types</option>
          {RECRUITMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          className={styles.fieldInput}
          placeholder="City"
          value={draft.city}
          onChange={(e) => onTextChange({ city: e.target.value })}
          aria-label="Filter by city"
        />

        <select
          className={styles.fieldSelect}
          value={draft.experience_level}
          onChange={(e) => onSelectChange({ experience_level: e.target.value })}
          aria-label="Filter by experience level"
        >
          <option value="">Any level</option>
          {EXPERIENCE_LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          inputMode="numeric"
          className={`${styles.fieldInput} ${styles.fieldInputNarrow}`}
          placeholder="Birth year"
          value={draft.birthYear}
          onChange={(e) => onTextChange({ birthYear: e.target.value })}
          aria-label="Filter by birth year"
        />

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
                <select
                  id="sheet-sport"
                  className={styles.fieldSelect}
                  value={sheetDraft.sport_id}
                  onChange={(e) => patchSheet({ sport_id: e.target.value })}
                >
                  <option value="">All sports</option>
                  {sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-type">
                  Recruitment type
                </label>
                <select
                  id="sheet-type"
                  className={styles.fieldSelect}
                  value={sheetDraft.recruitment_type}
                  onChange={(e) =>
                    patchSheet({
                      recruitment_type:
                        e.target.value as DiscoveryFilters["recruitment_type"],
                    })
                  }
                >
                  <option value="">All types</option>
                  {RECRUITMENT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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

              <div className={styles.sheetField}>
                <label className={styles.sheetLabel} htmlFor="sheet-experience">
                  Experience level
                </label>
                <select
                  id="sheet-experience"
                  className={styles.fieldSelect}
                  value={sheetDraft.experience_level}
                  onChange={(e) => patchSheet({ experience_level: e.target.value })}
                >
                  <option value="">Any level</option>
                  {EXPERIENCE_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
