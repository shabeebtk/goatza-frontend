/**
 * How a recruitment's enums read in English.
 *
 * Extracted from RecruitmentDetail when the public page (/r/<id>) started
 * rendering the same facts for a logged-out visitor. There are now two detail
 * surfaces showing one posting, and a posting that is an "Open trial" on one of
 * them and an "open_trial" on the other is the drift this file exists to stop.
 *
 * Only the maps BOTH surfaces use live here. `VISIBILITY_LABEL` and
 * `ORG_STATUS_LABEL` stay local to RecruitmentDetail: they describe
 * `visibility` and `status`, which are owner-only fields and are not on the
 * public payload at all.
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
  beginner: "Beginner",
  inter: "Intermediate",
  advanced: "Advanced",
}

export const APPLY_METHOD_LABEL: Record<string, string> = {
  goatza: "Goatza app",
  external: "External link",
  contact: "Contact",
}

export const BENEFIT_ICONS: Record<string, string> = {
  coach: "mdi:whistle-outline",
  trophy: "mdi:trophy-outline",
  award: "mdi:medal-outline",
  scholarship: "mdi:school-outline",
  fitness: "mdi:run-fast",
  travel: "mdi:airplane-outline",
  kit: "mdi:tshirt-crew-outline",
  certificate: "mdi:certificate-outline",
}
