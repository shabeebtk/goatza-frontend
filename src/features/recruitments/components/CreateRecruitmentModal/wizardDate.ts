/**
 * The wizard's date value and its conversions.
 *
 * Wizard date value format: "YYYY-MM-DD" (date only, no time chosen) OR
 * "YYYY-MM-DDTHH:MM" (date + time). A "no time" pick is stored at end-of-day
 * (23:59); legacy rows stored it at midnight (00:00). Both sentinels round-trip
 * back to date-only in `isoToLocalInput`, so the time is only shown when one
 * was really set.
 */

/** ISO from the server → wizard value. */
export function isoToLocalInput(iso: string | null): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const h = d.getHours(), m = d.getMinutes()
    if ((h === 0 && m === 0) || (h === 23 && m === 59)) return date
    return `${date}T${pad(h)}:${pad(m)}`
}

// Parse a wizard date value as a LOCAL Date. A date-only value means "that
// whole day", so it resolves to END of day (23:59) — this keeps a same-day
// timed deadline ≤ the event and stops a date-only "today" deadline from
// reading as already-past, matching the backend's datetime comparisons.
export function parseLocalInput(v: string): Date | null {
    if (!v) return null
    if (v.includes("T")) {
        const d = new Date(v)
        return Number.isNaN(d.getTime()) ? null : d
    }
    const [y, m, d] = v.split("-").map(Number)
    if (!y || !m || !d) return null
    const date = new Date(y, m - 1, d, 23, 59, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
}

// Wizard value → ISO 8601 for the API (undefined when empty/invalid).
export function localInputToISO(v: string): string | undefined {
    const d = parseLocalInput(v)
    return d ? d.toISOString() : undefined
}

// Human display of a wizard date value — time shown only when one was set.
export function fmtWizardDate(v: string): string | null {
    const d = parseLocalInput(v)
    if (!d) return null
    return v.includes("T")
        ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        : d.toLocaleDateString(undefined, { dateStyle: "medium" } as Intl.DateTimeFormatOptions)
}
