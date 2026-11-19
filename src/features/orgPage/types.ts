/**
 * The org's page, as the club's editor sees it. The server's half is the backend
 * CLAUDE.md's "Organization pages & enquiries" section; these mirror
 * apps/orgpages/serializers/page_serializers.py.
 *
 * Stage 2 adds programs, facilities, coaches and players.
 */

// ── Sections ──────────────────────────────────────────────────

/** A section the club can switch off. Posts has no switch. */
export type SwitchableSection =
  | "about"
  | "programs"
  | "facilities"
  | "coaches"
  | "players"
  | "squads"
  | "locations"
  | "trials"

export type SectionKey = SwitchableSection | "posts"

export const SWITCHABLE_SECTIONS: readonly SwitchableSection[] = [
  "about",
  "programs",
  "facilities",
  "coaches",
  "players",
  "squads",
  "locations",
  "trials",
]

type SectionBase = { enabled: boolean; switchable: boolean }

/** What the hub knows about each section: its switch and how much is in it. */
export type PageSections = {
  about: SectionBase & { filled: boolean }
  programs: SectionBase & { count: number }
  facilities: SectionBase & { items: number; photos: number }
  /** Visible coaches only. */
  coaches: SectionBase & { count: number }
  players: SectionBase & { count: number }
  /** Live public squads. */
  squads: SectionBase & { count: number }
  locations: SectionBase & { count: number }
  /** Open public trials. */
  trials: SectionBase & { count: number }
  /** Always on, never switchable. */
  posts: SectionBase & { count: number }
}

export type SectionStatus = PageSections[SectionKey]

// ── Settings ──────────────────────────────────────────────────

/** Numbers are stored E.164 ("+919876543210"), "" when none. */
export type PageContact = {
  enquiry_form_enabled: boolean
  whatsapp_enabled: boolean
  whatsapp_number: string
  call_enabled: boolean
  call_number: string
  email_enabled: boolean
  contact_email: string
}

export type WeekDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export const WEEK_DAYS: readonly WeekDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export type StudentRange = "" | "under_50" | "50_100" | "100_200" | "200_500" | "500_plus"

export type PageFacts = {
  founded_year: number | null
  age_min: number | null
  age_max: number | null
  coaching_languages: string[]
  /** Stored in week order. */
  training_days: WeekDay[]
  student_range: StudentRange
  /** The server's words for student_range; read-only. */
  student_range_label: string
  instagram_url: string
  youtube_url: string
  facebook_url: string
}

/** What PATCH page/facts takes: any of the facts, never the label. */
export type PageFactsPayload = Partial<Omit<PageFacts, "student_range_label">>

export type PageSettings = {
  contact: PageContact
  facts: PageFacts
  sections: Record<SwitchableSection, boolean>
}

// ── Readiness ─────────────────────────────────────────────────

export type ReadinessKey =
  | "programs"
  | "facilities"
  | "coaches"
  | "about"
  | "facts"
  | "photos"
  | "location"
  | "contact"

export type Readiness = {
  /** 0..100. A switched-off section's item leaves the score. */
  percent: number
  next: { key: ReadinessKey; label: string } | null
  items: { key: ReadinessKey; label: string; done: boolean }[]
}

// ── The hub ───────────────────────────────────────────────────

/** GET page/admin: any member with members.view; `can_edit` is page.manage. */
export type PageAdmin = {
  settings: PageSettings
  can_edit: boolean
  sections: PageSections
  readiness: Readiness
}

// ── Programs & fees ───────────────────────────────────────────

export type ProgramLevel = "beginner" | "intermediate" | "advanced" | "all_levels"
export type FeeMode = "amount" | "contact"
export type FeePer = "month" | "term" | "year" | "session"
export type ProgramSpots = "open" | "few" | "full"

export type ProgramFee = {
  mode: FeeMode
  /** Whole rupees; null for "contact". */
  amount: number | null
  currency: string
  per: FeePer | null
}

export type PageLocationMini = { id: string; name: string; city: string }

export type Program = {
  id: string
  name: string
  sport: { id: string; name: string }
  age_min: number
  age_max: number
  level: ProgramLevel
  level_label: string
  /** Week order. */
  days: WeekDay[]
  /** "16:30". */
  start_time: string
  end_time: string
  location: PageLocationMini | null
  fee: ProgramFee
  free_trial: boolean
  spots: ProgramSpots
  spots_label: string
}

/** POST page/programs (all) and PATCH page/programs/<id> (any of them). */
export type ProgramWritePayload = {
  name: string
  sport_id: string
  age_min: number
  age_max: number
  level: ProgramLevel
  days: WeekDay[]
  start_time: string
  end_time: string
  location_id: string | null
  fee_mode: FeeMode
  fee_amount: number | null
  fee_per: FeePer | null
  free_trial: boolean
  spots: ProgramSpots
}

// ── Facilities ────────────────────────────────────────────────

export type FacilityGroup = "playing_area" | "training" | "comfort" | "care_travel"

export type FacilityCatalogGroup = {
  group: FacilityGroup
  label: string
  items: { key: string; label: string }[]
}

export type FacilityPhoto = { id: string; url: string; order: number }

export type LocationFacilities = {
  location: PageLocationMini
  /** Catalog keys. */
  items: string[]
  /** The club's own words. */
  custom_items: string[]
  photos: FacilityPhoto[]
}

/** GET page/facilities: every branch of the org, primary first. */
export type PageFacilities = {
  catalog: FacilityCatalogGroup[]
  locations: LocationFacilities[]
}

// ── Coaches ───────────────────────────────────────────────────

export type CoachRole =
  | "head_coach"
  | "assistant_coach"
  | "goalkeeping_coach"
  | "fitness_coach"
  | "other"

export type Coach = {
  id: string
  is_member: boolean
  member_id: string | null
  /** A member's comes from their profile. */
  name: string
  username: string | null
  /** "" = none. */
  photo: string
  role: CoachRole
  role_label: string
  /** Required for "other" ("Girls coach"). */
  title: string
  licence: string
  years_coaching: number | null
  is_visible: boolean
  is_hidden: boolean
  order: number
}

export type CoachCandidate = {
  member_id: string
  name: string
  username: string
  photo: string
  role: string
}

/** GET page/coaches: hidden coaches included, and the members not added yet. */
export type PageCoaches = {
  coaches: Coach[]
  candidates: CoachCandidate[]
}

export type CoachDetailsPayload = {
  role?: CoachRole
  title?: string
  licence?: string
  years_coaching?: number | null
}

export type CoachCreatePayload = CoachDetailsPayload &
  ({ member_id: string } | { name: string; photo_url?: string; photo_public_id?: string })

export type CoachUpdatePayload = CoachDetailsPayload & {
  is_visible?: boolean
  /** A coach who isn't on Goatza only. */
  name?: string
  /** "" removes the photo (with photo_public_id ""). */
  photo_url?: string
  photo_public_id?: string
}

// ── Players we developed (opt-in) ─────────────────────────────

export type PlayerCandidate = {
  user: { id: string; name: string; username: string; photo: string }
  /** "2019 – 2023" / "2021 – now". */
  years_label: string
  position: string | null
  is_public_profile: boolean
  /** False for a private profile, or an account that can't be shown. */
  can_feature: boolean
}

export type FeaturedPlayer = PlayerCandidate & {
  id: string
  highlight: string
  order: number
}

/** Every players read and write answers with both lists. */
export type PagePlayers = {
  players: FeaturedPlayer[]
  candidates: PlayerCandidate[]
}

// ── The page as everyone else sees it (Phase 3) ───────────────

/**
 * GET page/showcase/<username> (signed in, any actor) and
 * GET public/organization/<username>/page (anonymous). Every miss is one 404.
 * The club's own members get no exception: a switched-off section is hidden for
 * them too.
 */
export type ShowcaseFacts = {
  founded_year: number | null
  age_min: number | null
  age_max: number | null
  coaching_languages: string[]
  training_days: WeekDay[]
  student_range: StudentRange
  student_range_label: string
  links: { instagram: string | null; youtube: string | null; facebook: string | null }
}

export type ShowcaseFacility = {
  location: PageLocationMini
  /** In the payload's order. */
  items: { key: string; label: string; group: FacilityGroup }[]
  custom_items: string[]
  photos: { id: string; url: string }[]
}

export type ShowcaseCoach = {
  id: string
  name: string
  username: string | null
  /** "" = none. */
  photo: string
  role_label: string
  licence: string
  years_coaching: number | null
}

export type ShowcasePlayer = {
  username: string
  name: string
  /** "" when there is none, and for a minor on the anonymous route. */
  photo: string
  position: string | null
  /** "2019 – 2023". */
  years_label: string
  now_at: string | null
  highlight: string | null
}

export type PageShowcase = {
  organization: { id: string; username: string; name: string; type: "club" | "team" | "academy" }
  /** A number or an email is here only while the club switched it on. */
  contact: { enquiry_form: boolean; whatsapp: string | null; call: string | null; email: string | null }
  /** The display order for the org's type, switched-off keys removed, "posts" last. */
  /** A key this build does not know is skipped, never drawn. */
  order: string[]
  sections: Record<SwitchableSection, boolean>
  facts: ShowcaseFacts | null
  programs: Program[]
  facilities: ShowcaseFacility[]
  coaches: ShowcaseCoach[]
  players: ShowcasePlayer[]
}
