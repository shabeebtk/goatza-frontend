/**
 * Achievements — display copy.
 *
 * Kept out of `types.ts` (which mirrors the API) and out of the components, so
 * the section, the org review queue and the form all print the same words for
 * the same enum value.
 *
 * Icon names are Iconify `mdi:*` strings, the same convention CareerSection and
 * CareerEntryCard pass straight to `<Icon icon={...} />`.
 */

import type { AchievementLevel, AchievementType } from "./types"

export const ACHIEVEMENT_TYPE_LABELS: Record<AchievementType, string> = {
    team_trophy: "Team Trophy",
    individual_award: "Individual Award",
    record: "Record",
    milestone: "Milestone",
    certification: "Certification",
    other: "Other",
}

/**
 * One icon per type. Unlike careers — where only two entry types earn a badge
 * because the rest are obvious from the organization — every achievement type
 * is worth showing: "Record" and "Certification" are genuinely different
 * things, and the card has no other cue for which it is.
 */
export const ACHIEVEMENT_TYPE_ICONS: Record<AchievementType, string> = {
    team_trophy: "mdi:trophy-outline",
    individual_award: "mdi:medal-outline",
    record: "mdi:chart-line",
    milestone: "mdi:flag-checkered",
    certification: "mdi:certificate-outline",
    other: "mdi:star-outline",
}

export const ACHIEVEMENT_LEVEL_LABELS: Record<AchievementLevel, string> = {
    school: "School",
    district: "District",
    state: "State",
    national: "National",
    international: "International",
    club_local: "Club / Local",
}

/**
 * The section's own icon, and the one the empty state shows. Named here rather
 * than inline so the header and the empty state can't drift apart.
 */
export const ACHIEVEMENTS_SECTION_ICON = "mdi:trophy-variant-outline"
export const ACHIEVEMENTS_EMPTY_ICON = "mdi:trophy-award"

/**
 * Two letters for the fallback avatar when no org logo is available.
 *
 * Duplicated from careerMeta on purpose — importing it would make this feature
 * depend on career's copy module for a string helper, and the two are free to
 * diverge. (OrganizationCombobox, which is a real shared component, IS imported
 * rather than copied.)
 */
export const issuerInitials = (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return "??"
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
}
