/**
 * Sports CV — display copy.
 *
 * Kept out of the components so the CV prints the same words for the same enum
 * value everywhere, the way `careerMeta` and `achievementMeta` do for theirs.
 *
 * `EXPERIENCE_LEVEL_LABELS` duplicates the private maps in
 * `UserSportsEditModal` and `UserSportsSection` — neither is exported, and both
 * are inside client components the CV has no other reason to pull in. Same
 * precedent as `issuerInitials` in achievementMeta. The strings must match the
 * backend's `UserSport.ExperienceLevel` values, and all three copies must agree.
 */

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
    professional: "Professional",
}

export const experienceLevelLabel = (value: string): string =>
    EXPERIENCE_LEVEL_LABELS[value] ?? value

/**
 * "175 cm" / "68.5 kg" — the measurables, or null when the player never gave
 * one. Null rather than a dash: a bio-data sheet with an empty row reads as
 * unfinished, so the row simply is not printed.
 */
export const heightLabel = (cm: number | null): string | null =>
    cm ? `${cm} cm` : null

export const weightLabel = (kg: number | null): string | null =>
    kg ? `${kg} kg` : null
