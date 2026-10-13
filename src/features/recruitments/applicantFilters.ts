// The org-side applicants list's filters — the modal's draft, the committed
// state the list queries with, and the removable chips under the toolbar all
// read this one shape. Its own type, not DiscoveryFilters: these narrow ONE
// recruitment's applicants, and almost nothing about a player-facing search
// carries over.

import type {
  FetchRecruitmentApplicantsParams,
  SelfReportedOutcome,
  TrialSession,
} from "./services/recruitments.api"

export type ApplicantGender = "" | "male" | "female" | "other"
export type ApplicantFee = "" | "paid" | "unpaid"
export type ApplicantSelfOutcome = "" | SelfReportedOutcome | "attended" | "not_attended"
export type ApplicantSort = "" | "birth_year" | "-birth_year"

/** Empty string / false = "unset" throughout, like DiscoveryFilters. */
export type ApplicantFilters = {
  /** A trial session id — only on a choose_one trial with several centres. */
  centre: string
  /** Birth years, never ages — the groups are modelled in birth years. */
  bornFrom: string
  bornTo: string
  gender: ApplicantGender
  /** A SportPosition id of the recruitment's sport. */
  position: string
  city: string
  fee: ApplicantFee
  ageMismatch: boolean
  hasHighlights: boolean
  /** "YYYY-MM-DD" from a native date input, on the trial's calendar. */
  appliedFrom: string
  appliedTo: string
  /** Result tab only — before the trial nobody has said anything. */
  selfOutcome: ApplicantSelfOutcome
  sort: ApplicantSort
}

export const EMPTY_APPLICANT_FILTERS: ApplicantFilters = {
  centre: "",
  bornFrom: "",
  bornTo: "",
  gender: "",
  position: "",
  city: "",
  fee: "",
  ageMismatch: false,
  hasHighlights: false,
  appliedFrom: "",
  appliedTo: "",
  selfOutcome: "",
  sort: "",
}

export const APPLICANT_GENDER_OPTIONS: { value: ApplicantGender; label: string }[] = [
  { value: "", label: "Any" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
]

export const APPLICANT_FEE_OPTIONS: { value: ApplicantFee; label: string }[] = [
  { value: "", label: "Any" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Due" },
]

export const APPLICANT_SELF_OUTCOME_OPTIONS: { value: ApplicantSelfOutcome; label: string }[] = [
  { value: "", label: "All" },
  { value: "selected", label: "Says selected" },
  { value: "not_selected", label: "Says not selected" },
  { value: "waiting", label: "Waiting" },
  { value: "not_attended", label: "Didn't attend" },
]

export const APPLICANT_SORT_OPTIONS: { value: ApplicantSort; label: string }[] = [
  { value: "", label: "Newest" },
  { value: "birth_year", label: "Born earliest" },
  { value: "-birth_year", label: "Born latest" },
]

/** What decides which sections — and which chips — apply to this trial. */
export type ApplicantFilterContext = {
  /** The Result tab is the only one where "what the player said" means anything. */
  isResultTab: boolean
  hasFee: boolean
  /** choose_one with more than one live centre. */
  centres: TrialSession[]
  centreLabel: (session: TrialSession) => string
  positions: { id: string; name: string }[]
}

/** "12 Oct" from "2026-10-12" — a chip, so no year and no weekday. */
function shortDay(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(parsed)
}

export type ApplicantFilterChip = {
  /** Which fields removing this chip clears. */
  clears: (keyof ApplicantFilters)[]
  label: string
}

/**
 * One removable chip per COMMITTED filter that applies here. A filter the
 * current tab or trial cannot use (self-outcome off the Result tab, fee on a
 * free trial) shows no chip — it is not narrowing anything.
 */
export function buildApplicantChips(
  f: ApplicantFilters,
  ctx: ApplicantFilterContext,
): ApplicantFilterChip[] {
  const chips: ApplicantFilterChip[] = []

  if (f.centre) {
    const session = ctx.centres.find((s) => s.id === f.centre)
    if (session) chips.push({ clears: ["centre"], label: ctx.centreLabel(session) })
  }
  if (f.bornFrom || f.bornTo) {
    const label =
      f.bornFrom && f.bornTo
        ? `Born ${f.bornFrom}–${f.bornTo}`
        : f.bornFrom
          ? `Born ${f.bornFrom} or later`
          : `Born ${f.bornTo} or earlier`
    chips.push({ clears: ["bornFrom", "bornTo"], label })
  }
  if (f.gender) {
    const label = APPLICANT_GENDER_OPTIONS.find((o) => o.value === f.gender)?.label
    chips.push({ clears: ["gender"], label: label ?? f.gender })
  }
  if (f.position) {
    const name = ctx.positions.find((p) => p.id === f.position)?.name
    chips.push({ clears: ["position"], label: name ?? "Position" })
  }
  if (f.city.trim()) chips.push({ clears: ["city"], label: `City: ${f.city.trim()}` })
  if (f.fee && ctx.hasFee) {
    chips.push({ clears: ["fee"], label: f.fee === "paid" ? "Fee paid" : "Fee due" })
  }
  if (f.ageMismatch) chips.push({ clears: ["ageMismatch"], label: "Age mismatch" })
  if (f.hasHighlights) chips.push({ clears: ["hasHighlights"], label: "Has highlights" })
  if (f.appliedFrom || f.appliedTo) {
    const label =
      f.appliedFrom && f.appliedTo
        ? `Applied ${shortDay(f.appliedFrom)}–${shortDay(f.appliedTo)}`
        : f.appliedFrom
          ? `Applied from ${shortDay(f.appliedFrom)}`
          : `Applied until ${shortDay(f.appliedTo)}`
    chips.push({ clears: ["appliedFrom", "appliedTo"], label })
  }
  if (f.selfOutcome && ctx.isResultTab) {
    const label = APPLICANT_SELF_OUTCOME_OPTIONS.find((o) => o.value === f.selfOutcome)?.label
    chips.push({ clears: ["selfOutcome"], label: label ?? f.selfOutcome })
  }
  // Sort narrows nothing, but it is a choice made in the modal, and a chip is
  // how the org sees why the list is in this order.
  if (f.sort) {
    const label = APPLICANT_SORT_OPTIONS.find((o) => o.value === f.sort)?.label
    chips.push({ clears: ["sort"], label: `Sort: ${label ?? f.sort}` })
  }

  return chips
}

const asYear = (value: string) => {
  const year = Number(value)
  return value.trim() && Number.isInteger(year) ? year : undefined
}

/**
 * The committed filters as the API's params. Anything this tab or trial
 * cannot use is left off rather than sent, so the server and the chips agree
 * about what is narrowing the list.
 */
export function applicantFilterParams(
  f: ApplicantFilters,
  ctx: Pick<ApplicantFilterContext, "isResultTab" | "hasFee" | "centres">,
): Omit<FetchRecruitmentApplicantsParams, "status" | "search" | "age_category" | "limit" | "offset"> {
  const centreValid = ctx.centres.some((s) => s.id === f.centre)
  return {
    session: centreValid ? f.centre : undefined,
    birth_year_min: asYear(f.bornFrom),
    birth_year_max: asYear(f.bornTo),
    gender: f.gender || undefined,
    position: f.position || undefined,
    city: f.city.trim() || undefined,
    fee_paid: !ctx.hasFee || !f.fee ? undefined : f.fee === "paid",
    age_mismatch: f.ageMismatch || undefined,
    has_highlights: f.hasHighlights || undefined,
    applied_from: f.appliedFrom || undefined,
    applied_to: f.appliedTo || undefined,
    self_outcome: ctx.isResultTab ? f.selfOutcome || undefined : undefined,
    sort: f.sort || undefined,
  }
}
