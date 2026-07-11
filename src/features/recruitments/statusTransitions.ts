import type { RecruitmentStatus } from "./services/recruitments.api"

/**
 * Client-side mirror of the server state machine
 * (RecruitmentService.ALLOWED_TRANSITIONS in goatza-backend).
 *
 * This is ONLY used to hide invalid options in the UI. The server remains
 * authoritative — if it returns 400, we surface that and never optimistically
 * flip the status.
 *
 *   draft     → active (publish) · cancelled (discard)
 *   active    → closed (close)   · cancelled (cancel)
 *   closed    → active (reopen)
 *   cancelled → (terminal — no transitions out)
 */

export type RecruitmentStatusAction = {
  /** Target status for this transition. */
  to: RecruitmentStatus
  /** Button/row label, e.g. "Publish". */
  label: string
  /** Short helper line under the label. */
  helper: string
  icon: string
  /** Destructive transitions (→ cancelled) require an inline confirm step. */
  destructive?: boolean
  /** Success toast message. */
  toast: string
  /** Confirm-step copy (only used when destructive). */
  confirmTitle?: string
  confirmBody?: string
}

export const STATUS_TRANSITIONS: Record<RecruitmentStatus, RecruitmentStatusAction[]> = {
  draft: [
    {
      to: "active",
      label: "Publish",
      helper: "Make it live — applicants can apply",
      icon: "mdi:rocket-launch-outline",
      toast: "Recruitment published",
    },
    {
      to: "cancelled",
      label: "Discard",
      helper: "Cancel this draft for good",
      icon: "mdi:cancel",
      destructive: true,
      toast: "Recruitment cancelled",
      confirmTitle: "Discard this recruitment?",
      confirmBody: "It will be cancelled and can't be reopened.",
    },
  ],
  active: [
    {
      to: "closed",
      label: "Close",
      helper: "Stop new applications, keep it visible",
      icon: "mdi:lock-outline",
      toast: "Recruitment closed",
    },
    {
      to: "cancelled",
      label: "Cancel",
      helper: "Applicants can no longer apply",
      icon: "mdi:cancel",
      destructive: true,
      toast: "Recruitment cancelled",
      confirmTitle: "Cancel this recruitment?",
      confirmBody: "Applicants can no longer apply. This can't be undone.",
    },
  ],
  closed: [
    {
      to: "active",
      label: "Reopen",
      helper: "Applicants can apply again",
      icon: "mdi:lock-open-variant-outline",
      toast: "Recruitment reopened",
    },
  ],
  cancelled: [],
}
