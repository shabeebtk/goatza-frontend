"use client"

/**
 * The diary's filter row.
 *
 * Every control here drives a QUERY PARAM, never a client-side filter. The list
 * is paginated, so filtering the loaded pages would hide matches that simply
 * had not been fetched yet and leave the count disagreeing with the rows.
 *
 * The sport control is absent for a single-sport player, which is almost
 * everyone. A dropdown with one option is a control that can only be used
 * wrongly.
 *
 * ONE ROW AT EVERY WIDTH, statuses and year together. The year picker used to
 * wrap onto a line of its own below 640px, where "All years" sitting alone
 * above the diary read as a heading or a stray chip rather than as the filter
 * it is. It is the same kind of control as the segments beside it, so it sits
 * beside them; the segmented control absorbs the squeeze by scrolling, which it
 * already did. The rule lives in the CSS — see `.filters`.
 */

import { useMemo } from "react"

import { MATCH_STATUSES } from "../../types"
import type { MatchListFilters, MatchStatus } from "../../types"
import { MATCH_STATUS_LABELS } from "../../matchDiaryMeta"
import styles from "./MatchDiaryPage.module.css"

/**
 * How many seasons back the year picker offers.
 *
 * A fixed window rather than the years the player actually has entries in: the
 * list is paged, so the client never holds the full set of years, and asking
 * the server for them would be a second endpoint for a dropdown. Six covers a
 * school career; "All" is the default and always shows everything.
 */
const YEAR_WINDOW = 6

export type SportOption = { id: string; name: string }

export default function MatchDiaryFilters({
    filters,
    sports,
    onChange,
}: {
    filters: MatchListFilters
    sports: SportOption[]
    onChange: (next: MatchListFilters) => void
}) {
    const years = useMemo(() => {
        const current = new Date().getFullYear()
        return Array.from({ length: YEAR_WINDOW }, (_, index) => current - index)
    }, [])

    const showSports = sports.length > 1

    return (
        <div className={styles.filters}>
            <div
                className={styles.segmented}
                role="radiogroup"
                aria-label="Filter by status"
            >
                <FilterSegment
                    label="All"
                    active={!filters.status}
                    onSelect={() => onChange({ ...filters, status: undefined })}
                />
                {MATCH_STATUSES.map((status) => (
                    <FilterSegment
                        key={status}
                        label={MATCH_STATUS_LABELS[status]}
                        active={filters.status === status}
                        onSelect={() => onChange({ ...filters, status })}
                    />
                ))}
            </div>

            <div className={styles.selects}>
                <label className={styles.selectWrap}>
                    <span className="sr-only">Filter by year</span>
                    <select
                        className={styles.select}
                        value={filters.year ?? ""}
                        onChange={(event) =>
                            onChange({
                                ...filters,
                                year: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                            })
                        }
                    >
                        <option value="">All years</option>
                        {years.map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                </label>

                {showSports && (
                    <label className={styles.selectWrap}>
                        <span className="sr-only">Filter by sport</span>
                        <select
                            className={styles.select}
                            value={filters.sportId ?? ""}
                            onChange={(event) =>
                                onChange({
                                    ...filters,
                                    sportId: event.target.value || undefined,
                                })
                            }
                        >
                            <option value="">All sports</option>
                            {sports.map((sport) => (
                                <option key={sport.id} value={sport.id}>
                                    {sport.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
        </div>
    )
}

function FilterSegment({
    label,
    active,
    onSelect,
}: {
    label: string
    active: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
            onClick={onSelect}
        >
            {label}
        </button>
    )
}

/** True when anything is narrowing the list — drives the "clear" affordance. */
export const hasActiveFilters = (filters: MatchListFilters): boolean =>
    Boolean(filters.status || filters.year || filters.sportId)

/**
 * A readable description of what is currently filtered, for the empty state.
 * "No matches in 2025." reads better than "No matches match your filters."
 */
export const filterSummary = (
    filters: MatchListFilters,
    sports: SportOption[]
): string => {
    const parts: string[] = []

    if (filters.status) {
        parts.push(
            MATCH_STATUS_LABELS[filters.status as MatchStatus].toLowerCase()
        )
    }

    const sport = sports.find((option) => option.id === filters.sportId)
    if (sport) parts.push(sport.name.toLowerCase())

    const where = parts.length ? ` ${parts.join(" ")}` : ""
    const when = filters.year ? ` in ${filters.year}` : ""

    return `No${where} matches${when}.`
}
