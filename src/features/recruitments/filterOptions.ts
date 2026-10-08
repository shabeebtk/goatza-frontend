// Shared option lists + filter shape for the player-facing recruitments
// discovery page. Kept in one place so the desktop filter bar, the mobile
// bottom-sheet, and the active-filter chips all read from the same source.
import type { RecruitmentType } from "./services/recruitments.api"
import { RECRUITMENT_TYPES, TYPE_LABEL } from "./recruitmentCopy"

// The two creatable types only. There is deliberately no scholarship filter:
// a scholarship is now a benefit on a posting, and benefits are not
// filterable. A saved URL still carrying `type=scholarship` is dropped when
// the discovery page reads its filters (see readFilters).
export const RECRUITMENT_TYPE_OPTIONS: {
  value: RecruitmentType
  label: string
}[] = RECRUITMENT_TYPES.map((value) => ({ value, label: TYPE_LABEL[value] }))

// How far out the "Near you" filter can reach. 50 km is the discover default
// (§4) and the option the "See all" deep-link lands on.
export const DISTANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "10", label: "Within 10 km" },
  { value: "25", label: "Within 25 km" },
  { value: "50", label: "Within 50 km" },
  { value: "100", label: "Within 100 km" },
]

export const DEFAULT_DISTANCE_KM = 50

// WHO THE TRIAL IS OPEN TO. Only the two a player can BE: "Any" is the
// absence of the filter, not a third value, which is why its chip carries
// the empty string.
export const GENDER_FILTER_OPTIONS: { value: "" | "male" | "female"; label: string }[] = [
  { value: "", label: "Any" },
  { value: "male", label: "Boys" },
  { value: "female", label: "Girls" },
]

/** The rails' own rules, as filters — see the "See all" links in §5. */
export const CLOSING_SOON_DAYS = 7
export const NEW_THIS_WEEK_DAYS = 7

// Committed filter state — the single source of truth is the URL; this is the
// decoded shape the discovery UI works with. Empty string / false = "unset".
export type DiscoveryFilters = {
  search: string
  sport_id: string
  recruitment_type: RecruitmentType | ""
  city: string
  birthYear: string
  /**
   * "Open to" — "" is unset. Answered by the trial's CATEGORIES where it
   * has any (a category may narrow the trial's gender, or inherit it), which
   * is why a trial can match "Girls" without its own field saying so.
   */
  gender: "" | "male" | "female"
  goatza: boolean
  // §4 discovery filters.
  positionId: string
  distanceKm: string
  /** "For me" — filters on AGE only, and only when the player asks for it. */
  forMe: boolean
  // Set by the "Closing soon" / "New this week" rails' "See all". They round
  // trip through the URL like every other filter so back/forward and the
  // remove-chip affordance work on them too.
  closingWithinDays: string
  publishedWithinDays: string
}

export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  search: "",
  sport_id: "",
  recruitment_type: "",
  city: "",
  birthYear: "",
  gender: "",
  goatza: false,
  positionId: "",
  distanceKm: "",
  forMe: false,
  closingWithinDays: "",
  publishedWithinDays: "",
}
