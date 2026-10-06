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
 * `TYPE_LABEL` is THE recruitment-type wording — the card, the chat card,
 * the discovery filter, My applications and the create wizard all read it.
 * There used to be six copies and they had drifted ("Open Trial" here, "Open
 * trial" there). Sentence case everywhere; a chip that wants capitals gets
 * them from CSS, never from a forked string.
 */

import type {
  RecruitmentType,
  RecruitmentTypeValue,
} from "./services/recruitments.api"

/** The types an org can create today, in the order they are offered. */
export const RECRUITMENT_TYPES: RecruitmentType[] = ["open_trial", "player_looking"]

/** A value from a URL or a form, narrowed to a creatable type. */
export function isRecruitmentType(value: string | null | undefined): value is RecruitmentType {
  return (RECRUITMENT_TYPES as string[]).includes(value ?? "")
}

export const TYPE_LABEL: Record<RecruitmentTypeValue, string> = {
  open_trial: "Open trial",
  player_looking: "Looking for players",
  // Legacy values — kept so pre-migration rows still render a label. Each
  // reads as the type the data migration folds it into.
}

export const GENDER_LABEL: Record<string, string> = {
  male: "Male only",
  female: "Female only",
  all: "Open to all",
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
