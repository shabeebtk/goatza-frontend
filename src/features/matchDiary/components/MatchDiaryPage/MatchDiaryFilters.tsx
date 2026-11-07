"use client"

/**
 * The results' filter row: the year, and the sport when there is a choice.
 *
 * Every control here drives a QUERY PARAM, never a client-side filter. The list
 * is paginated, so filtering the loaded pages would hide matches that simply
 * had not been fetched yet and leave the count disagreeing with the rows.
 *
 * The sport control is absent for a single-sport player, which is almost
 * everyone. A dropdown with one option is a control that can only be used
 * wrongly. There is no status control: results are played matches only, and
 * fixtures live in Up next.
 */

import { useMemo } from "react"

import Select from "@/shared/components/ui/Select/Select"

import type { MatchListFilters } from "../../types"
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

/** What this row controls. The status is fixed by the page. */
export type DiaryFilters = Omit<MatchListFilters, "status">

export default function MatchDiaryFilters({
    filters,
    sports,
    onChange,
}: {
    filters: DiaryFilters
    sports: SportOption[]
    onChange: (next: DiaryFilters) => void
}) {
    const years = useMemo(() => {
        const current = new Date().getFullYear()
        return Array.from({ length: YEAR_WINDOW }, (_, index) => current - index)
    }, [])

    const showSports = sports.length > 1

    return (
        <div
            className={`${styles.filters} ${showSports ? "" : styles.filtersSingle}`}
        >
            <Select
                size="sm"
                aria-label="Filter by year"
                sheetTitle="Year"
                value={filters.year != null ? String(filters.year) : ""}
                onChange={(value) =>
                    onChange({
                        ...filters,
                        year: value ? Number(value) : undefined,
                    })
                }
                options={[
                    { value: "", label: "All years" },
                    ...years.map((year) => ({
                        value: String(year),
                        label: String(year),
                    })),
                ]}
            />

            {showSports && (
                <Select
                    size="sm"
                    aria-label="Filter by sport"
                    sheetTitle="Sport"
                    value={filters.sportId ?? ""}
                    onChange={(sportId) =>
                        onChange({ ...filters, sportId: sportId || undefined })
                    }
                    options={[
                        { value: "", label: "All sports" },
                        ...sports.map((sport) => ({
                            value: sport.id,
                            label: sport.name,
                        })),
                    ]}
                />
            )}
        </div>
    )
}

/** True when anything is narrowing the list — drives the "clear" affordance. */
export const hasActiveFilters = (filters: DiaryFilters): boolean =>
    Boolean(filters.year || filters.sportId)

/**
 * A readable description of what is currently filtered, for the empty state.
 * "No matches in 2025." reads better than "No matches match your filters."
 */
export const filterSummary = (
    filters: DiaryFilters,
    sports: SportOption[]
): string => {
    const sport = sports.find((option) => option.id === filters.sportId)
    const where = sport ? ` ${sport.name.toLowerCase()}` : ""
    const when = filters.year ? ` in ${filters.year}` : ""

    return `No${where} matches${when}.`
}
