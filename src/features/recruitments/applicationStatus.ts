// Shared application-status presentation (org-side applicants view).
// Colours mirror the applicant banner in RecruitmentDetail; labels are the
// short org-facing forms used by the filter chips + row badges.
import type { ApplicationStatus } from "./services/recruitments.api"

export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; icon: string; colorClass: string }
> = {
  applied: { label: "Applied", icon: "mdi:inbox-arrow-down-outline", colorClass: "applied" },
  reviewing: { label: "Reviewing", icon: "mdi:eye-outline", colorClass: "reviewing" },
  shortlisted: { label: "Shortlisted", icon: "mdi:star-outline", colorClass: "shortlisted" },
  invited: { label: "Invited", icon: "mdi:email-check-outline", colorClass: "invited" },
  selected: { label: "Selected", icon: "mdi:trophy-outline", colorClass: "selected" },
  rejected: { label: "Rejected", icon: "mdi:close-circle-outline", colorClass: "rejected" },
  withdrawn: { label: "Withdrawn", icon: "mdi:undo-variant", colorClass: "withdrawn" },
}

// Display order for the filter chips.
export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "applied",
  "reviewing",
  "shortlisted",
  "invited",
  "selected",
  "rejected",
  "withdrawn",
]
