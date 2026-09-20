/**
 * How a recruitment's enums read in English.
 *
 * Extracted from RecruitmentDetail when the public page (/r/<id>) started
 * rendering the same facts for a logged-out visitor. There are now two detail
 * surfaces showing one posting, and a posting that is an "Open trial" on one of
 * them and an "open_trial" on the other is the drift this file exists to stop.
 *
 * `VISIBILITY_LABEL` is here too, though it is owner-only: the detail page
 * and the create wizard's publish control both show it, and "Followers only"
 * on one and "followers_only" on the other is the same drift.
 * `ORG_STATUS_LABEL` stays local to RecruitmentDetail.
 *
 * RecruitmentCard and CreateRecruitmentModal still carry their own copies.
 * Folding those in is a worthwhile tidy and a separate change — the card's
 * labels are sized for a chip and the modal's are option text, so they are not
 * automatically the same strings.
 */

export const TYPE_LABEL: Record<string, string> = {
  open_trial: "Open trial",
  player_looking: "Player looking",
  private_trial: "Private trial",
  direct_recruitment: "Direct recruitment",
  scholarship: "Scholarship",
}

export const GENDER_LABEL: Record<string, string> = {
  male: "Male only",
  female: "Female only",
  all: "Open to all",
}

export const EXPERIENCE_LABEL: Record<string, string> = {
  district: "District level",
  state: "State level",
  national: "National level",
  international: "International level",
  beginner: "Beginner",
  inter: "Intermediate",
  advanced: "Advanced",
}

export const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  followers_only: "Followers only",
  private: "Private",
}

export const APPLY_METHOD_LABEL: Record<string, string> = {
  goatza: "Goatza app",
  external: "External link",
  contact: "Contact",
}

/**
 * The benefit icon set — ONE list, used both ways.
 *
 * The create wizard offers exactly these in its picker, and the two detail
 * surfaces look a saved `icon_name` up in `BENEFIT_ICONS` (derived below).
 * The picker and the lookup used to be two hand-kept lists: the picker
 * offered `money` and `network`, the lookup knew `scholarship` and
 * `fitness` instead, so two of the eight choices rendered a fallback star on
 * the page. Anything added here is offered AND rendered.
 */
export const BENEFIT_ICON_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: "coach", label: "Coaching", icon: "mdi:whistle-outline" },
  { value: "trophy", label: "Trophy", icon: "mdi:trophy-outline" },
  { value: "award", label: "Award", icon: "mdi:medal-outline" },
  { value: "scholarship", label: "Scholarship", icon: "mdi:school-outline" },
  { value: "fitness", label: "Fitness", icon: "mdi:run-fast" },
  { value: "travel", label: "Travel", icon: "mdi:airplane-outline" },
  { value: "kit", label: "Kit", icon: "mdi:tshirt-crew-outline" },
  { value: "certificate", label: "Certificate", icon: "mdi:certificate-outline" },
  { value: "money", label: "Stipend", icon: "mdi:currency-inr" },
  { value: "network", label: "Networking", icon: "mdi:account-group-outline" },
]

export const BENEFIT_ICONS: Record<string, string> = Object.fromEntries(
  BENEFIT_ICON_OPTIONS.map((o) => [o.value, o.icon])
)
