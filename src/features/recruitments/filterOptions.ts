// Shared option lists + filter shape for the player-facing recruitments
// discovery page. Kept in one place so the desktop filter bar, the mobile
// bottom-sheet, and the active-filter chips all read from the same source.
import type { RecruitmentType } from "./services/recruitments.api"

export const RECRUITMENT_TYPE_OPTIONS: {
  value: RecruitmentType
  label: string
}[] = [
  { value: "open_trial", label: "Open Trial" },
  { value: "player_looking", label: "Player Looking" },
  { value: "direct_recruitment", label: "Direct Recruitment" },
  { value: "scholarship", label: "Scholarship" },
]

// Mirrors the exact experience_level options CreateRecruitmentModal offers.
export const EXPERIENCE_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "district", label: "District" },
  { value: "state", label: "State" },
  { value: "national", label: "National" },
  { value: "international", label: "International" },
]

// Committed filter state — the single source of truth is the URL; this is the
// decoded shape the discovery UI works with. Empty string / false = "unset".
export type DiscoveryFilters = {
  search: string
  sport_id: string
  recruitment_type: RecruitmentType | ""
  city: string
  experience_level: string
  birthYear: string
  goatza: boolean
}

export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilters = {
  search: "",
  sport_id: "",
  recruitment_type: "",
  city: "",
  experience_level: "",
  birthYear: "",
  goatza: false,
}
