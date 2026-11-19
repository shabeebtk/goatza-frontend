"use client"

import Select from "@/shared/components/ui/Select/Select"
import { yearsLabel } from "../../format"
import type { Coach, CoachDetailsPayload, CoachRole } from "../../types"
import { PageTextField } from "../PageFields/PageFields"
import styles from "./PeoplePage.module.css"

// The server's limits (apps/orgpages/constants.py).
export const COACH_NAME_MIN = 2
export const COACH_NAME_MAX = 80
export const COACH_TITLE_MAX = 40
export const COACH_LICENCE_MAX = 60
export const YEARS_COACHING_MAX = 60

export const COACH_ROLE_OPTIONS: { value: CoachRole; label: string }[] = [
  { value: "head_coach", label: "Head coach" },
  { value: "assistant_coach", label: "Assistant coach" },
  { value: "goalkeeping_coach", label: "Goalkeeping coach" },
  { value: "fitness_coach", label: "Fitness coach" },
  { value: "other", label: "Other" },
]

/** The details every coach has, as the sheets' fields hold them. */
export type CoachDetails = {
  role: CoachRole
  title: string
  licence: string
  years: string
}

export const emptyCoachDetails = (): CoachDetails => ({
  role: "head_coach",
  title: "",
  licence: "",
  years: "",
})

export const coachDetailsOf = (coach: Coach): CoachDetails => ({
  role: coach.role,
  title: coach.title ?? "",
  licence: coach.licence ?? "",
  years: coach.years_coaching === null || coach.years_coaching === undefined ? "" : String(coach.years_coaching),
})

/** The server's rules, checked first. Keys are the server's field names. */
export function coachDetailsErrors(details: CoachDetails): Record<string, string> {
  const errors: Record<string, string> = {}
  if (details.role === "other" && !details.title.trim()) errors.title = "Add a title, like Girls coach."
  if (details.title.trim().length > COACH_TITLE_MAX) errors.title = `Keep the title to ${COACH_TITLE_MAX} characters.`
  if (details.licence.trim().length > COACH_LICENCE_MAX) {
    errors.licence = `Keep the licence to ${COACH_LICENCE_MAX} characters.`
  }
  if (details.years.trim()) {
    const years = Number(details.years)
    if (!Number.isInteger(years) || years < 0 || years > YEARS_COACHING_MAX) {
      errors.years_coaching = `Years go from 0 to ${YEARS_COACHING_MAX}.`
    }
  }
  return errors
}

/** The details as the server takes them. A title only means something for "other". */
export function coachDetailsPayload(details: CoachDetails): Required<CoachDetailsPayload> {
  return {
    role: details.role,
    title: details.role === "other" ? details.title.trim() : "",
    licence: details.licence.trim(),
    years_coaching: details.years.trim() ? Number(details.years) : null,
  }
}

/** Role, title (for Other), licence and years: the fields every coach sheet shares. */
export function CoachDetailsFields({
  idBase,
  value,
  onChange,
  errors,
}: {
  idBase: string
  value: CoachDetails
  onChange: (next: CoachDetails) => void
  errors: Record<string, string>
}) {
  const set = (patch: Partial<CoachDetails>) => onChange({ ...value, ...patch })

  return (
    <>
      <Select
        id={`${idBase}-role`}
        label="Role"
        sheetTitle="Role"
        options={COACH_ROLE_OPTIONS}
        value={value.role}
        onChange={(role) => set({ role: role as CoachRole })}
        error={errors.role}
      />
      {value.role === "other" && (
        <PageTextField
          id={`${idBase}-title`}
          label="Title"
          placeholder="Girls coach"
          maxLength={COACH_TITLE_MAX}
          autoComplete="off"
          value={value.title}
          onChange={(event) => set({ title: event.target.value })}
          error={errors.title}
        />
      )}
      <PageTextField
        id={`${idBase}-licence`}
        label="Licence (optional)"
        placeholder="AIFF C Licence"
        maxLength={COACH_LICENCE_MAX}
        autoComplete="off"
        value={value.licence}
        onChange={(event) => set({ licence: event.target.value })}
        error={errors.licence}
      />
      <div className={styles.narrow}>
        <PageTextField
          id={`${idBase}-years`}
          label="Years coaching (optional)"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="5"
          value={value.years}
          onChange={(event) => set({ years: event.target.value.replace(/\D/g, "").slice(0, 2) })}
          error={errors.years_coaching}
        />
      </div>
    </>
  )
}

/** "Head coach · AIFF C Licence · 12 yrs", and "Not on Goatza" for someone who isn't. */
export function coachLine(coach: Coach): string {
  return [
    coach.role_label,
    coach.licence,
    yearsLabel(coach.years_coaching),
    coach.is_member ? "" : "Not on Goatza",
  ]
    .filter(Boolean)
    .join(" · ")
}

/** In format.ts now, which the public page shares; still exported here for the editor. */
export { initialsOf } from "../../format"
