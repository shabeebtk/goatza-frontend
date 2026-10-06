// Shared application-status presentation.
//
// Two audiences read these, and they are told different things:
//  - The ORG sees its pipeline as it is: APPLICATION_STATUS_META, statusLabel().
//    Colours mirror the applicant banner in RecruitmentDetail; labels are the
//    short forms used by the filter chips + row badges.
//  - The PLAYER sees playerStatusMeta() / playerStatusLabel(). The org's
//    shortlist is private, so `shortlisted` reads exactly like `reviewing` —
//    same words, colour AND icon, or the badge itself would give it away.
import type {
  ApplicationStatus,
  BulkStatusTarget,
  RecruitmentTypeValue,
} from "./services/recruitments.api"

export type StatusMeta = { label: string; icon: string; colorClass: string }

/**
 * `not_selected` -> `Not selected`. The last resort for a status value
 * this build does not know.
 *
 * It happens for real: `invited` and `rejected` were removed from the
 * choices, and a row written before the backfill still carries one. The
 * honest thing is to show the word the server sent, tidied — not
 * "undefined", and not a guess at which bucket it belongs in.
 */
function humanise(value: string): string {
  if (!value) return "—"
  const spaced = value.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export const APPLICATION_STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  applied: { label: "Applied", icon: "mdi:inbox-arrow-down-outline", colorClass: "applied" },
  reviewing: { label: "Reviewing", icon: "mdi:eye-outline", colorClass: "reviewing" },
  shortlisted: { label: "Shortlisted", icon: "mdi:star-outline", colorClass: "shortlisted" },
  // Per-type wording — read it through statusLabel(), never this label directly.
  trial_confirmed: { label: "Confirmed for trial", icon: "mdi:check-decagram-outline", colorClass: "confirmed" },
  not_shortlisted: { label: "Not shortlisted", icon: "mdi:close-circle-outline", colorClass: "notShortlisted" },
  selected: { label: "Selected", icon: "mdi:trophy-outline", colorClass: "selected" },
  not_selected: { label: "Not selected", icon: "mdi:close-circle-outline", colorClass: "notSelected" },
  withdrawn: { label: "Withdrawn", icon: "mdi:undo-variant", colorClass: "withdrawn" },
}

// `trial_confirmed` means "come along" — an open trial confirms a place on
// the day, a looking-for-players post invites the player in.
const TRIAL_CONFIRMED_LABEL: Record<RecruitmentTypeValue, string> = {
  open_trial: "Confirmed for trial",
  player_looking: "Invited to trial",
}

/**
 * The org-facing label for a status. `recruitmentType` only matters for
 * `trial_confirmed`; without it that reads "Confirmed for trial".
 */
export function statusLabel(
  status: ApplicationStatus,
  recruitmentType?: RecruitmentTypeValue,
): string {
  if (status === "trial_confirmed") {
    return (recruitmentType && TRIAL_CONFIRMED_LABEL[recruitmentType]) || "Confirmed for trial"
  }
  // A value this build has never heard of — a row written before the
  // backfill, read by a client deployed after it. Humanise the slug
  // rather than rendering "undefined" or a raw "not_shortlisted".
  return APPLICATION_STATUS_META[status]?.label ?? humanise(status)
}

/** Org-facing meta with the per-type label already applied. */
export function statusMeta(
  status: ApplicationStatus,
  recruitmentType?: RecruitmentTypeValue,
): StatusMeta {
  const meta = APPLICATION_STATUS_META[status] ?? APPLICATION_STATUS_META.applied
  return { ...meta, label: statusLabel(status, recruitmentType) }
}

// ── Player-facing ─────────────────────────────────────────────

const UNDER_REVIEW: StatusMeta = {
  label: "Under review",
  icon: APPLICATION_STATUS_META.reviewing.icon,
  colorClass: APPLICATION_STATUS_META.reviewing.colorClass,
}

// Only where the player must be told something different from the org.
//
// KEYED BY STRING, not by ApplicationStatus: `rejected` is gone from the
// union but a pre-backfill row still carries it, and this override is the
// whole reason a child reading their own application sees "Not selected" in
// grey rather than the word "Rejected". Losing it to a type change would be
// a real regression in tone at the worst possible moment.
const PLAYER_OVERRIDES: Record<string, StatusMeta | undefined> = {
  reviewing: UNDER_REVIEW,
  shortlisted: UNDER_REVIEW,
  rejected: APPLICATION_STATUS_META.not_selected,
}

/** What the applicant sees for their own application. */
export function playerStatusMeta(
  status: ApplicationStatus,
  recruitmentType?: RecruitmentTypeValue,
): StatusMeta {
  return PLAYER_OVERRIDES[status] ?? statusMeta(status, recruitmentType)
}

export function playerStatusLabel(
  status: ApplicationStatus,
  recruitmentType?: RecruitmentTypeValue,
): string {
  return playerStatusMeta(status, recruitmentType).label
}

/**
 * The player's own status filter chips (My applications). The review states
 * are deliberately absent: the player endpoint filters on ONE status, so an
 * "Under review" chip could only ever match `reviewing` — and a shortlisted
 * application missing from it would give the private shortlist away. They
 * show under "All", badged "Under review". The legacy values are absent too.
 */
export const PLAYER_STATUS_FILTERS: ApplicationStatus[] = [
  "applied",
  "trial_confirmed",
  "not_shortlisted",
  "selected",
  "not_selected",
  "withdrawn",
]

// ── Org pipeline: stages, and what may be set from each ───────
// One place for both the applicants list's tabs and the drawer's options, so
// the two can never offer different moves for the same application.

export type PipelineStage = "screening" | "confirmed" | "result"

export type PipelineStageConfig = {
  key: PipelineStage
  label: string
  /** The statuses the tab lists — and whose counts it sums. */
  statuses: ApplicationStatus[]
  /** The bulk actions valid at this stage. None → rows are not selectable. */
  actions: BulkStatusTarget[]
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    key: "screening",
    label: "Screening",
    // A row still carrying a pre-split value (`invited` / `rejected`) is
    // not named here — those are gone from the union. It simply sits
    // outside every stage tab until the backfill rewrites it, which is
    // visible rather than wrong: the org sees the count, not a row in the
    // wrong bucket.
    statuses: ["applied", "reviewing", "shortlisted", "not_shortlisted"],
    actions: ["reviewing", "shortlisted", "trial_confirmed", "not_shortlisted"],
  },
  {
    key: "confirmed",
    label: "Confirmed",
    statuses: ["trial_confirmed"],
    // Fee, announcements and messaging arrive in a later stage.
    actions: [],
  },
  {
    key: "result",
    label: "Result",
    statuses: ["selected", "not_selected"],
    actions: ["selected", "not_selected"],
  },
]

/**
 * The statuses an org may move ONE application to from where it stands.
 * `not_shortlisted` is a screening outcome, so it gets the screening moves
 * (the org can change its mind before the trial). Withdrawn → nothing.
 */
export function statusTargetsFrom(current: ApplicationStatus): BulkStatusTarget[] {
  switch (current) {
    case "applied":
    case "reviewing":
    case "shortlisted":
    case "not_shortlisted":
      return ["reviewing", "shortlisted", "trial_confirmed", "not_shortlisted"]
    case "trial_confirmed":
      return ["selected", "not_selected", "not_shortlisted"]
    case "selected":
    case "not_selected":
      return ["selected", "not_selected"]
    default:
      return []
  }
}

// The imperative on a button — statusLabel() names the resulting STATE
// ("Invited to trial"), this names the move ("Invite to trial").
const ACTION_LABEL: Record<BulkStatusTarget, string> = {
  reviewing: "Reviewing",
  shortlisted: "Shortlist",
  trial_confirmed: "Confirm for trial",
  not_shortlisted: "Not shortlisted",
  selected: "Selected",
  not_selected: "Not selected",
}

const INVITE_TYPES: RecruitmentTypeValue[] = ["player_looking"]

export function statusActionLabel(
  target: BulkStatusTarget,
  recruitmentType?: RecruitmentTypeValue,
): string {
  if (target === "trial_confirmed" && recruitmentType && INVITE_TYPES.includes(recruitmentType)) {
    return "Invite to trial"
  }
  return ACTION_LABEL[target]
}

/** One plain line under each option: what the PLAYER is (or isn't) told. */
export const STATUS_ACTION_DESCRIPTION: Record<BulkStatusTarget, string> = {
  reviewing: "Application is under review — the player isn't told.",
  shortlisted: "Your private shortlist — the player isn't told.",
  trial_confirmed: "The player is told they can attend, and gets their pass.",
  not_shortlisted: "The player is told they haven't been called for this trial.",
  selected: "The player is told they've been selected.",
  not_selected: "The player is told they weren't selected this time.",
}

/** The two "not this time" outcomes: each tells players, so each asks first. */
export const CONFIRM_FIRST: BulkStatusTarget[] = ["not_shortlisted", "not_selected"]
