/**
 * Career — display copy.
 *
 * Kept out of `types.ts` (which mirrors the API) and out of the components, so
 * the section, the org review queue and the Stage 7 form all print the same
 * words for the same enum value.
 */

import type { CareerEntryType, CareerSquadLevel } from "./types"

export const CAREER_ENTRY_TYPE_LABELS: Record<CareerEntryType, string> = {
    club_team: "Club Team",
    national_team: "National Team",
    loan: "Loan",
    academy: "Academy",
    school_college: "School / College",
    other: "Other",
}

export const CAREER_SQUAD_LEVEL_LABELS: Record<CareerSquadLevel, string> = {
    youth: "Youth",
    reserve: "Reserve",
    senior: "Senior",
}

/**
 * Entry types that earn a badge on the timeline.
 *
 * Deliberately only these two. A club stint is the default and needs no label;
 * an academy or school year is already obvious from the organization. A LOAN
 * and a NATIONAL TEAM call-up are the two that change how you read the dates —
 * both legitimately overlap another entry, and without the badge the timeline
 * looks like the player was in two places at once.
 */
export const BADGED_ENTRY_TYPES: readonly CareerEntryType[] = [
    "loan",
    "national_team",
]

/** The badge text for an entry type, or null when it doesn't get one. */
export const entryTypeBadge = (entryType: CareerEntryType): string | null =>
    BADGED_ENTRY_TYPES.includes(entryType)
        ? CAREER_ENTRY_TYPE_LABELS[entryType]
        : null

/** Two letters for the fallback avatar when no org logo is available. */
export const organizationInitials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return "??"
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}
