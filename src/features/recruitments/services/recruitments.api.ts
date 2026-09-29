import api from "@/core/api/axios"

// ── Enums ─────────────────────────────────────────────────────

// Creatable today — what the wizard offers and create/update accepts.
export type RecruitmentType = "open_trial" | "player_looking"

// Anything the API may still return, including pre-migration rows. The data
// migration (migrate_recruitment_v3) folds the two legacy values into the
// creatable ones; until it has run everywhere, read paths must still label them.
export type RecruitmentTypeValue =
  | RecruitmentType

export type RecruitmentStatus = "draft" | "active" | "closed" | "cancelled"

export type RecruitmentVisibility = "public" | "followers_only" | "private"

export type RecruitmentGender = "male" | "female" | "all"

// Every value the API may return, including pre-migration rows.
export type ApplicationStatus =
  | "applied"
  | "reviewing"
  | "shortlisted"
  | "trial_confirmed"
  | "not_shortlisted"
  | "selected"
  | "not_selected"
  | "withdrawn"

export type QuestionFieldType =
  | "short_text"
  | "long_text"
  // LEGACY, READ-ONLY. The wizard has not offered a raw dropdown for a long
  // time and normalises this to "radio" on load, but stored rows still carry
  // it and the backend still lists it in its choices — so the apply modal has
  // to keep rendering it.
  | "select"
  | "radio"
  | "checkbox"
  | "number"

// ── Shared sub-types ──────────────────────────────────────────

export type RecruitmentOrganization = {
  id: string
  name: string
  username: string
  type: string
  logo: string
  headline: string
  is_verified: boolean
}

export type RecruitmentSport = {
  id: string
  name: string
  icon_name: string
  icon_url: string
}

export type RecruitmentPosition = {
  position: {
    id: string
    name: string
  }
  is_primary: boolean
}

export type RecruitmentMedia = {
  id: string
  media_type: "image" | "video"
  file_url: string
  public_id: string
  thumbnail_url: string
  duration: number | null
  order: number
}

export type QuestionOption = {
  id: string
  value: string
}

export type RecruitmentQuestion = {
  id: string
  question: string
  field_type: QuestionFieldType
  is_required: boolean
  placeholder: string
  help_text: string
  options: QuestionOption[]
}

// The age group an application was submitted under. `null` when the
// recruitment had no groups, or the group was deleted on a later org edit.
export type ApplicationAgeCategory = {
  id: string
  title: string
  reporting_time: string | null   // "HH:MM:SS" | null
}

/**
 * THE PLAYER'S OWN ACCOUNT of how a trial went — a HINT for the org, never a
 * status. `attended_self_reported` is null until they answer;
 * `outcome_self_reported` is "" when they did not attend or have not answered.
 *
 * Every field is optional: a payload cached before this shipped has none of
 * them, and the prompt and the summary row must both behave then.
 */
export type SelfReportedOutcome = "selected" | "not_selected" | "waiting"

export type TrialSelfReport = {
  attended_self_reported?: boolean | null
  outcome_self_reported?: SelfReportedOutcome | ""
  /** The player's rating. DETAIL/player-only — never on the org's list row. */
  trial_rating?: number | null
  /** Their written note. Owning org only; see the backend model docstring. */
  trial_feedback?: string
  /** Stamped on every accepted answer, including "I did not attend". */
  feedback_at?: string | null
}

/**
 * WHETHER TO ASK, computed by the server. Do NOT re-derive it from dates and
 * statuses on the client: getting it subtly different from the server is how
 * a prompt appears that then 400s.
 *
 *   can_give_feedback     right status, trial over, not answered yet
 *   feedback_window_open  the trial ended within the last 30 days
 *
 * The prompt shows when BOTH are true. The endpoint itself stays open
 * indefinitely and accepts a resubmit — a player who said "waiting" and
 * later hears back is exactly the answer most worth having.
 */
export type TrialFeedbackEligibility = {
  can_give_feedback?: boolean
  feedback_window_open?: boolean
}

export type MyApplication = TrialSelfReport &
  TrialFeedbackEligibility & {
    id: string
    status: ApplicationStatus
    applied_at: string
    updated_at: string
    age_category: ApplicationAgeCategory | null
    /** The date they picked. Null unless the trial is choose_one. */
    session?: ApplicationSession | null
  }

// ── List item (lightweight) ───────────────────────────────────

// ── Trial dates ────────────────────────────────────────

/**
 * How a multi-date trial is attended — and therefore when applications close.
 *
 *   all         every date is one trial, so applications close on the FIRST
 *   choose_one  each date is its own round, so they close on the LAST
 *
 * Only meaningful with two or more dates; the server forces "all" below that.
 */
export type SessionMode = "all" | "choose_one"

/**
 * ONE date an open trial is held on. The venue fields arrive RESOLVED: the
 * server has already substituted the recruitment's venue wherever the date
 * did not set its own, so nothing on the client has to fall back.
 */
export type TrialSession = {
  id: string
  title: string
  date: string            // "YYYY-MM-DD"
  start_time: string | null   // "HH:MM:SS" | null
  end_time: string | null
  is_cancelled: boolean
  venue_name: string
  venue_link: string
  city: string
  latitude: number | null
  longitude: number | null
}

/** The chosen date on an application. Null unless the trial is choose_one. */
export type ApplicationSession = {
  id: string
  title: string
  date: string
  start_time: string | null
  venue_name: string
  venue_link: string
  city: string
}

/**
 * The trial-window fields every recruitment payload now carries.
 *
 * `event_date` is unchanged and still the FIRST date. What is new is that it
 * is no longer the whole story: `trial_end_date` is when the trial is OVER,
 * and `applications_close_at` is when applications STOP — which on an
 * "attend every date" trial is day one, not the last day.
 *
 * Every field is optional: a payload cached before sessions shipped has none
 * of them, and both `isTrialOver` and the detail view fall back to
 * `event_date` on their own.
 */
export type RecruitmentTrialWindow = {
  sessions?: TrialSession[]
  session_mode?: SessionMode
  trial_end_date?: string | null
  applications_close_at?: string | null
  /** Everyone who applies is confirmed instantly. Open trial only. */
  auto_confirm?: boolean
}

export type Recruitment = RecruitmentTrialWindow & {
  id: string
  title: string
  short_description: string
  recruitment_type: RecruitmentTypeValue
  status: RecruitmentStatus
  visibility: RecruitmentVisibility
  city: string
  applications_count: number
  event_date: string
  created_at: string
  organization: RecruitmentOrganization
  sport: RecruitmentSport
  positions: RecruitmentPosition[]
  // Optional: an older cached list payload predates it. An EMPTY array is
  // meaningful ("open to all ages"); missing means "we weren't told".
  age_categories?: RecruitmentAgeCategory[]
  // Everything below is optional for the same reason: a payload cached before
  // the list serializer was widened must still type-check and still render.
  // The card treats each one as "not told" rather than as a zero or a false.
  application_deadline?: string | null
  is_paid?: boolean
  /** DRF serializes DecimalField as a string — parse before formatting. */
  fee_amount?: string | null
  fee_currency?: string
  /** Preferred over `city` on the card when set; city stays the fallback. */
  venue_name?: string
  /** Available to callers, deliberately not rendered on the card (§4). */
  gender?: RecruitmentGender | ""
  /**
   * Whether the ACTIVE ACTOR shortlisted this one. Optional for the same
   * reason as the fields above — a payload cached before the bookmark shipped
   * must still type-check — and the card reads a missing value as "not
   * saved", which is what an empty bookmark already means.
   */
  is_saved?: boolean
  /**
   * The FIRST photo, as the card's media slot renders it. Shipped by the list
   * serializer since the card was built and never read until now — which is why
   * a card with five uploaded photos used to show none of them.
   */
  cover_media?: RecruitmentCoverMedia | null
  /** How many photos there are, for the "1/4" badge. */
  media_count?: number
  /**
   * The trial day is over (its calendar day has ended in Asia/Kolkata). The
   * server hides such trials from the player lists but the org, a shortlist
   * and an application still carry them. Optional: older cached payloads
   * predate it, and `isTrialOver` works it out from `event_date` then.
   */
  is_trial_over?: boolean
  // Match context (§5). Present on /discover and on the ranked "All" tab;
  // absent on the org-scoped mounts, which stay newest-first and unscored.
  // Every field is optional for exactly that reason — a card must render fine
  // with none of them.
  match?: RecruitmentMatchContext
}

/** The list payload's `cover_media` — a `MediaLike`, so mediaDelivery reads it. */
export type RecruitmentCoverMedia = {
  media_type: string
  file_url: string
  thumbnail_url: string | null
}

// ── Match context (§3/§5) ─────────────────────────────────────

/**
 * How well a recruitment fits the viewer, as REASONS rather than a number.
 *
 * `match_score` is here so ordering stays debuggable, but §5 is explicit that
 * the card never renders it: a score invites argument, a reason builds trust.
 * The card draws "Your sport · Striker · 8 km · Closes in 5 days" from the
 * fields below instead.
 *
 * `is_eligible` is display + ranking ONLY. It never gates Apply — that stays
 * derived from `is_accepting_applications`, server-side, exactly as before.
 */
export type RecruitmentMatchContext = {
  match_score: number | null
  is_eligible: boolean
  /** Informational, never prohibitive: "U-17 only", "Applications closed". */
  eligibility_badge: string | null
  /** "primary" = the viewer's main sport, "other" = one they also play. */
  sport_match: "primary" | "other" | "none" | null
  /** null when either side left positions unstated — unknown, not a mismatch. */
  position_match: boolean | null
  /** The positions that actually overlapped — the chip's own words. */
  matched_positions: string[]
  /** null when either side has no coordinates. */
  distance_km: number | null
  /** Negative once the deadline has passed; null when there is no deadline. */
  days_to_deadline: number | null
}

// The backend returns the match fields FLAT alongside the card fields (one
// serializer, one object). Reading them into a nested `match` keeps the card's
// props honest about what is optional.
type RecruitmentApiRow = Omit<Recruitment, "match"> &
  Partial<RecruitmentMatchContext> & {
    // Discover-only; `application_deadline` moved onto `Recruitment` itself
    // once every mount's card started counting down to it.
    published_at?: string | null
  }

const MATCH_KEYS = [
  "match_score",
  "is_eligible",
  "eligibility_badge",
  "sport_match",
  "position_match",
  "matched_positions",
  "distance_km",
  "days_to_deadline",
] as const

function withMatch(row: RecruitmentApiRow): Recruitment {
  // An unranked payload carries none of these; leave `match` undefined so the
  // card skips the whole chip row rather than rendering empty chips.
  if (!MATCH_KEYS.some((key) => key in row)) return row as Recruitment

  return {
    ...(row as Recruitment),
    match: {
      match_score: row.match_score ?? null,
      is_eligible: row.is_eligible ?? true,
      eligibility_badge: row.eligibility_badge ?? null,
      sport_match: row.sport_match ?? null,
      position_match: row.position_match ?? null,
      matched_positions: row.matched_positions ?? [],
      distance_km: row.distance_km ?? null,
      days_to_deadline: row.days_to_deadline ?? null,
    },
  }
}

// ── Detail (full — user + org-owner fields) ───────────────────

// Either bound may be null — that is an open-ended group: min only reads
// "born <min> or later", max only reads "born <max> or earlier". Both null is
// impossible (the backend rejects it); "open to all ages" is an EMPTY list.
export type RecruitmentAgeCategory = {
  id: string
  title: string
  min_birth_year: number | null
  max_birth_year: number | null
  reporting_time: string | null   // "HH:MM:SS" | null
  display_order?: number
}
 
export type RecruitmentBenefit = {
  id: string
  title: string
  icon_name: string
  display_order?: number
}
 
export type RecruitmentRequirement = {
  id: string
  title: string
  is_mandatory: boolean
  display_order?: number
}

// Free-text "who can attend" lines the recruiter wrote. Never checked against
// the viewer — Goatza displays them, the venue verifies them.
export type RecruitmentEligibilityCriteria = {
  id: string
  title: string
  display_order?: number
}
 
export type RecruitmentContact = {
  id: string
  name: string
  contact_type: "phone" | "email"
  value: string
}
 
// ── Detail (full — user + org-owner fields) ───────────────────
 
export type RecruitmentDetail = RecruitmentTrialWindow & {
  id: string
  title: string
  short_description: string
  description: string
  recruitment_type: RecruitmentTypeValue
  visibility: RecruitmentVisibility
  apply_method: "goatza" | "external" | "contact"
  gender: RecruitmentGender | ""
  /**
   * RETIRED FROM THE UI. The server still sends it and pre-migration rows
   * still carry a value, but nothing renders or filters on it any more — the
   * five levels became free-text eligibility criteria. Kept because this type
   * describes what the server sends, not what the client happens to read.
   */
  experience_level: string
  application_deadline: string | null
  event_date: string | null
  is_remote: boolean
  is_paid: boolean
  fee_amount: string | null
  fee_currency: string
  payment_note: string
  venue_name: string
  venue_link: string
  location_name: string
  city: string
  country_code: string
  latitude: number | null
  longitude: number | null
  external_apply_url: string
  applications_count: number
  organization: RecruitmentOrganization
  sport: RecruitmentSport
  positions: RecruitmentPosition[]
  media: RecruitmentMedia[]
  questions: RecruitmentQuestion[]
  age_categories: RecruitmentAgeCategory[]
  benefits: RecruitmentBenefit[]
  requirements: RecruitmentRequirement[]
  eligibility_criteria: RecruitmentEligibilityCriteria[]
  contacts: RecruitmentContact[]
  my_application: MyApplication | null
  can_apply: boolean
  /**
   * The server's single source of truth for status + deadline + the
   * max-applications cap. PUBLIC, unlike `status`/`max_applications`, so it is
   * what a non-owner viewer's closed/open treatment must be driven from.
   * Optional only for older cached payloads.
   */
  is_accepting_applications?: boolean
  created_at: string
  /** The bookmark, same flag the card carries. Optional: older cached detail. */
  is_saved?: boolean
  /** The trial day is over — same flag the card carries; see `isTrialOver`. */
  is_trial_over?: boolean
  /**
   * The VIEWER's own profile birth year — only on the authenticated detail,
   * never the public one. null for an org actor or when no birthdate is on
   * file; absent on older cached payloads. Drives the apply modal's age-group
   * warning and nothing else.
   */
  viewer_birth_year?: number | null
 
  // Org-owner-only fields (present when viewer is the org admin)
  status?: RecruitmentStatus
  max_applications?: number | null
  confirmed_count?: number
  selected_count?: number
  views_count?: number
  /**
   * How many actors shortlisted this posting. Owner-only and an AGGREGATE:
   * the server never says WHO saved it — the shortlist stays private to the
   * saver. Absent (not zero) on a non-owner payload.
   */
  saves_count?: number
  /**
   * How the players rated the trial. Owner-only and an AGGREGATE — an
   * individual rating stays between the player and the org that ran the
   * trial. `rating_average` is null until somebody rates.
   */
  rating_average?: number | null
  rating_count?: number
  published_at?: string | null
  updated_at?: string
}



export type CreateRecruitmentPositionPayload = {
  position_id: string
  // Legacy field — no longer set from the UI (all positions are equal). Kept
  // optional so the backend still accepts it; it defaults to false server-side.
  is_primary?: boolean
}

export type CreateRecruitmentQuestionOptionPayload = {
  value: string
}

export type CreateRecruitmentQuestionPayload = {
  question: string
  field_type: "short_text" | "long_text" | "select" | "radio" | "checkbox" | "number"
  is_required: boolean
  options?: CreateRecruitmentQuestionOptionPayload[]
}

export type CreateRecruitmentMediaPayload = {
  file_url: string
  public_id: string
  media_type: "image" | "video"
  order: number
  // Optional — sent when preserving already-uploaded media on edit so
  // video thumbnails/durations are not lost. New uploads omit them.
  thumbnail_url?: string
  duration?: number
}

/**
 * The `location` block on a recruitment (docs/PLACES_MIGRATION.md 5.4).
 *
 * `provider` + `external_id` are NEW. This payload used to send a label and a
 * point and nothing else, which meant every recruitment created its own
 * Location row and none of them could ever be found — or coordinate-refreshed —
 * by place id.
 */
export type CreateRecruitmentLocationPayload = {
  provider?: "google"
  external_id?: string
  name?: string
  type?: "city" | "place"
  city?: string
  state?: string
  country?: string
  country_code?: string
  latitude?: number
  longitude?: number
}

/**
 * One trial date on the way OUT.
 *
 * `id` is the load-bearing field on an edit: the server DIFF-SYNCS on it,
 * so a row that keeps its id is updated in place and a row that loses one
 * is deleted and recreated — which SET_NULLs the date every applicant
 * picked. New rows omit it; rows loaded from the API must carry it back.
 */
export type CreateTrialSessionPayload = {
  id?: string
  title?: string
  date: string              // "YYYY-MM-DD"
  start_time?: string       // "HH:MM"
  end_time?: string
  venue_name?: string
  venue_link?: string
  location?: CreateRecruitmentLocationPayload
  is_cancelled?: boolean
  display_order?: number
}

export type CreateRecruitmentAgeCategoryPayload = {
  // Present ONLY for a group that already exists on the server. The backend
  // diff-syncs on it, so echoing the id back on edit is what keeps the group
  // (and every application filed under it) alive across a save.
  id?: string
  title: string
  // Send exactly one for an open-ended group ("born 2010 or later"). Never
  // both null — that shape is rejected server-side.
  min_birth_year: number | null
  max_birth_year: number | null
  reporting_time?: string   // "HH:MM:SS" or undefined
  display_order: number
}
 
export type CreateRecruitmentBenefitPayload = {
  title: string
  icon_name: string
  display_order: number
}
 
export type CreateRecruitmentRequirementPayload = {
  title: string
  is_mandatory: boolean
  display_order: number
}

export type CreateRecruitmentEligibilityCriteriaPayload = {
  title: string
  display_order: number
}
 
export type CreateRecruitmentContactPayload = {
  name?: string
  contact_type: "phone" | "email"
  value: string
}

export type ApplyMethod = "goatza" | "external" | "contact"

// ── Updated full payload ──────────────────────────────────────

export type CreateRecruitmentPayload = {
  title: string
  short_description: string
  description?: string
  recruitment_type: RecruitmentType
  visibility: RecruitmentVisibility
  gender?: RecruitmentGender | "all"
  sport_id: string
  /** Still ACCEPTED by the server; no longer SENT — the wizard has no setter
   *  for it, and an omitted key leaves a stored value untouched. */
  experience_level?: string
  application_deadline?: string    // ISO 8601
  event_date?: string              // ISO 8601
  max_applications?: number
  // Draft vs publish — create only (omit / "active" publishes, "draft" saves).
  status?: "draft" | "active"
  // How players apply
  apply_method?: ApplyMethod
  external_apply_url?: string
  is_paid: boolean
  fee_amount?: string
  fee_currency?: string
  payment_note?: string
  // Venue
  venue_name?: string
  venue_link?: string
  // Location
  location?: CreateRecruitmentLocationPayload
  // Collections
  positions?: CreateRecruitmentPositionPayload[]        // [] means "Any"
  // [] means "open to all ages" — there is no separate flag.
  age_categories?: CreateRecruitmentAgeCategoryPayload[]
  // The trial's dates. An open trial sends at least one; every other
  // type sends none at all.
  sessions?: CreateTrialSessionPayload[]
  session_mode?: SessionMode
  auto_confirm?: boolean
  benefits?: CreateRecruitmentBenefitPayload[]
  requirements?: CreateRecruitmentRequirementPayload[]
  eligibility_criteria?: CreateRecruitmentEligibilityCriteriaPayload[]
  contacts?: CreateRecruitmentContactPayload[]
  questions?: CreateRecruitmentQuestionPayload[]
  media?: CreateRecruitmentMediaPayload[]
}

export type CreateRecruitmentResponse = {
  recruitment_id: string
  /**
   * What changed that applicants would want to hear about — any date, time,
   * venue, or a date added / removed / cancelled.
   *
   * Editing a recruitment notifies NOBODY by itself; this is the nudge that
   * stops a moved date going untold. EMPTY when nothing schedule-related
   * changed AND empty when there are no applicants, because there is then
   * nobody to tell. Absent on a create.
   */
  schedule_changed_fields?: string[]
}

// ── List response ─────────────────────────────────────────────

export type RecruitmentsListResponse = {
  count: number
  limit: number
  offset: number
  results: Recruitment[]
}

// ── Params ────────────────────────────────────────────────────

export type FetchRecruitmentsParams = {
  username?: string
  sport_id?: string
  status?: RecruitmentStatus
  recruitment_type?: RecruitmentType
  // Player-facing discovery filters (global public feed). The backend ignores
  // junk values, so unset filters are simply omitted from the request.
  search?: string
  city?: string
  /** A live server filter that the UI no longer offers: it could only ever
   *  match pre-migration rows. Kept because the param still works. */
  experience_level?: string
  birth_year?: number
  apply_method?: ApplyMethod
  position_id?: string
  max_distance_km?: number
  /** The "for me" toggle — filters on AGE only, and only when asked for. */
  age_eligible?: boolean
  // What the "Closing soon" / "New this week" rails mean as a filter, so their
  // "See all" opens the same rule rather than an unfiltered list.
  closing_within_days?: number
  published_within_days?: number
  limit?: number
  offset?: number
}

// ── API calls ─────────────────────────────────────────────────

export const fetchRecruitmentsApi = async (
  params: FetchRecruitmentsParams
): Promise<RecruitmentsListResponse> => {
  const res = await api.get("/recruitments/list", {
    params: { limit: 10, ...params },
  })
  const data = res.data.data
  return { ...data, results: (data.results ?? []).map(withMatch) }
}

// ── Discover (§4) ─────────────────────────────────────────────

export type DiscoverSection =
  | "recommended"
  | "closing_soon"
  | "near_you"
  | "new_this_week"

/** Profile fields the match score actually reads (§5's honest prompt). */
export type MissingProfileField =
  | "sport"
  | "positions"
  | "birthdate"
  | "location"

export type RecruitmentDiscoverResponse = {
  recommended: Recruitment[]
  closing_soon: Recruitment[]
  near_you: Recruitment[]
  new_this_week: Recruitment[]
  max_distance_km: number
  /**
   * False for an org actor, or a player with no sports on file. The sections
   * are still real — just ordered by freshness / deadline / distance instead
   * of by fit. The client cannot infer this from an empty payload, which is
   * why the server says it outright.
   */
  is_personalized: boolean
  missing_profile_fields: MissingProfileField[]
}

export const DISCOVER_SECTIONS: DiscoverSection[] = [
  "recommended",
  "closing_soon",
  "near_you",
  "new_this_week",
]

export const fetchRecruitmentDiscoverApi = async (params: {
  max_distance_km?: number
}): Promise<RecruitmentDiscoverResponse> => {
  const res = await api.get("/recruitments/discover", { params })
  const data = res.data.data
  return {
    ...data,
    ...Object.fromEntries(
      DISCOVER_SECTIONS.map((section) => [
        section,
        (data[section] ?? []).map(withMatch),
      ])
    ),
  } as RecruitmentDiscoverResponse
}

// ── My applications (player) ──────────────────────────────────

// The org summary embedded on a player's own application row — only the fields
// the backend's MyApplication serializer returns (no type/headline).
export type ApplicationOrgSummary = {
  id: string
  name: string
  username: string
  logo: string
  is_verified: boolean
}

export type MyApplicationRecruitment = {
  id: string
  title: string
  recruitment_type: RecruitmentTypeValue
  status: RecruitmentStatus
  city: string
  event_date: string | null
  application_deadline: string | null
  /** The trial day is over — see `isTrialOver`. Optional: older payloads. */
  is_trial_over?: boolean
  /** The LAST date. `isTrialOver` reads this before event_date. */
  trial_end_date?: string | null
  applications_close_at?: string | null
  session_mode?: SessionMode
  /** The fee line only renders when there is a fee to show. */
  is_paid?: boolean
  fee_amount?: string | null
  fee_currency?: string
  organization: ApplicationOrgSummary
  sport: RecruitmentSport
}

export type MyApplicationListItem = TrialSelfReport &
  TrialFeedbackEligibility & {
    id: string
    status: ApplicationStatus
    applied_at: string
    updated_at: string
    recruitment: MyApplicationRecruitment
    age_category: ApplicationAgeCategory | null
    /** The date they picked. Null unless the trial is choose_one. */
    session?: ApplicationSession | null
    /** Whether the org marked the trial fee collected. Read-only here. */
    fee_paid?: boolean
  }

export type MyApplicationsResponse = {
  count: number
  limit: number
  offset: number
  results: MyApplicationListItem[]
}

export type FetchMyApplicationsParams = {
  status?: ApplicationStatus
  limit?: number
  offset?: number
}

export const fetchMyApplicationsApi = async (
  params: FetchMyApplicationsParams
): Promise<MyApplicationsResponse> => {
  const res = await api.get("/recruitments/applications/my", { params })
  return res.data.data
}

export const fetchRecruitmentDetailApi = async (
  recruitmentId: string
): Promise<RecruitmentDetail> => {
  const res = await api.get(`/recruitments/${recruitmentId}/details`)
  return res.data.data
}



export const createRecruitmentApi = async (
  payload: CreateRecruitmentPayload
): Promise<CreateRecruitmentResponse> => {
  const res = await api.post("/recruitments/create", payload)
  return res.data.data
}

// Create and update share the exact same body shape.
export type RecruitmentPayload = CreateRecruitmentPayload

export const updateRecruitmentApi = async (
  recruitmentId: string,
  payload: RecruitmentPayload
): Promise<CreateRecruitmentResponse> => {
  const res = await api.patch(`/recruitments/${recruitmentId}/update`, payload)
  return res.data.data
}

// ── Status change ─────────────────────────────────────────────

export type ChangeRecruitmentStatusResponse = {
  recruitment_id: string
  status: RecruitmentStatus
}

export const changeRecruitmentStatusApi = async (
  recruitmentId: string,
  status: RecruitmentStatus
): Promise<ChangeRecruitmentStatusResponse> => {
  const res = await api.patch(`/recruitments/${recruitmentId}/status`, { status })
  return res.data.data
}

// ── Apply (player) ────────────────────────────────────────────

export type ApplyAnswerPayload = {
  question_id: string
  // Free-text answer (short_text / long_text / number). Omitted for option types.
  answer_text?: string
  // Chosen option ids (select / radio → one, checkbox → one or more).
  selected_option_ids?: string[]
}

export type ApplyRecruitmentPayload = {
  // Contact the applicant chose to share for THIS application (prefilled from
  // their profile, but editable). Stored as submitted by the backend.
  shared_name: string
  shared_email?: string
  shared_phone: string
  // Which age group the player is applying under. Omitted when the
  // recruitment has no groups. Never derived from their profile.
  age_category?: string
  // Which DATE they are attending. Required by the server on a
  // choose_one trial, ignored entirely on every other posting.
  session?: string
  answers: ApplyAnswerPayload[]
}

export type ApplyRecruitmentResponse = {
  application_id: string
  status: ApplicationStatus
  applied_at: string
}

export const applyRecruitmentApi = async (
  recruitmentId: string,
  payload: ApplyRecruitmentPayload
): Promise<ApplyRecruitmentResponse> => {
  const res = await api.post(`/recruitments/${recruitmentId}/apply`, payload)
  return res.data.data
}

// ── Org-side applicants (read-only) ───────────────────────────

export type ApplicantMini = {
  id: string
  username: string
  name: string
  avatar: string
  headline: string
}

export type ApplicantListItem = {
  id: string
  status: ApplicationStatus
  applied_at: string
  shared_name: string
  shared_email: string
  shared_phone: string
  applicant: ApplicantMini
  /**
   * Clips this viewer may watch — drives the "▶ Highlights (n)" chip. Comes
   * batched with the list (one grouped query), so the chip costs no request.
   * `null` on endpoints that don't supply it (e.g. application detail).
   */
  highlights_count?: number | null
  age_category: ApplicationAgeCategory | null
  /** The date they picked. Null unless the trial is choose_one. */
  session?: ApplicationSession | null
  /**
   * The trial fee, as the org recorded it at the gate. INFORMATION, never
   * a gate: nothing in the pipeline reads it, and an unpaid applicant can
   * still be confirmed and selected.
   */
  fee_paid?: boolean
  fee_paid_at?: string | null
  fee_marked_by?: { id: string; name: string } | null
  /**
   * WHAT THE PLAYER SAID about the trial — a claim, never a status. The LIST
   * carries only these three (enough for a chip); the rating and the written
   * note are on the DETAIL payload, so a list the org scans does not put a
   * number beside a face.
   */
  attended_self_reported?: boolean | null
  outcome_self_reported?: SelfReportedOutcome | ""
  feedback_at?: string | null
  /**
   * The profile birth year sat outside `age_category`'s band when they
   * applied. Computed server-side, frozen at apply time; never blocks anything.
   * Optional only for older cached payloads.
   */
  age_mismatch_at_apply?: boolean
}

export type ApplicationAnswer = {
  question: string
  field_type: QuestionFieldType
  answer_text: string
  selected_options: string[]
}

// One move in an application's pipeline, newest first on the detail payload.
// Org-internal: the note is the org's own reason and never reaches the player.
export type ApplicationStatusHistoryEntry = {
  id: string
  from_status: ApplicationStatus | ""
  to_status: ApplicationStatus
  note: string
  created_at: string
  /** The org member who made the move; null for the applicant's own moves
   *  (apply, withdraw) and for automatic writes such as the data migration. */
  changed_by: { id: string; name: string } | null
}

export type ApplicationDetail = ApplicantListItem & {
  answers: ApplicationAnswer[]
  /**
   * THE OWNING ORG ONLY — the server gates this by serializer, not by a
   * column, so it appears on the detail payload and nowhere else.
   */
  trial_rating?: number | null
  trial_feedback?: string
  /** The LIVE profile birth year (null when not on file), set beside the
   *  frozen `age_mismatch_at_apply` so a later correction is visible. */
  applicant_birth_year?: number | null
  status_history?: ApplicationStatusHistoryEntry[]
}

// Every application status → count for the recruitment (zeros included).
export type ApplicationStatusCounts = Record<ApplicationStatus, number>

export type RecruitmentApplicantsResponse = {
  count: number
  limit: number
  offset: number
  results: ApplicantListItem[]
  status_counts: ApplicationStatusCounts
  /**
   * How many applicants a birth-year range is HIDING, because they have
   * no birth year on file. 0 when no range is active. Without rendering
   * it, a range filter silently loses people and the org never knows.
   */
  no_birth_year_count?: number
}

export type FetchRecruitmentApplicantsParams = {
  /**
   * One status, or several — a stage tab of the pipeline. Several go out as
   * ONE comma-separated `status` param; the backend filters with status__in
   * and drops unknown values, so pagination and `count` stay server-side.
   */
  status?: ApplicationStatus | ApplicationStatus[]
  search?: string
  // Age-group id. The backend ignores an id it doesn't own, same as status.
  age_category?: string
  /** Whether the trial fee was collected. Absent means no filter. */
  fee_paid?: boolean
  /**
   * How old the applicant ACTUALLY is, which is a different question from
   * `age_category` (the group they applied UNDER). Birth years throughout,
   * never ages: the groups are modelled in birth years, and mixing the two
   * produces an off-by-one every January.
   */
  birth_year_min?: number
  birth_year_max?: number
  /** "true" narrows to the mismatched rows. Never widens to the rest. */
  age_mismatch?: boolean
  /**
   * WHAT THE PLAYER SAID, which is a different question from `status` (what
   * the org decided). This is the filter the whole self-report feature exists
   * for: narrow to "says selected", select all, mark Selected.
   */
  self_outcome?: SelfReportedOutcome | "attended" | "not_attended"
  /** Newest first by default; birth_year sorts unknowns LAST either way. */
  sort?: "birth_year" | "-birth_year"
  limit?: number
  offset?: number
}

export const fetchRecruitmentApplicantsApi = async (
  recruitmentId: string,
  params: FetchRecruitmentApplicantsParams
): Promise<RecruitmentApplicantsResponse> => {
  const { status, fee_paid, age_mismatch, self_outcome, ...rest } = params
  const res = await api.get(`/recruitments/${recruitmentId}/applications`, {
    params: {
      ...rest,
      status: Array.isArray(status) ? status.join(",") || undefined : status,
      // Booleans go out as the strings the backend reads; `undefined`
      // keeps the key off the query string entirely.
      fee_paid: fee_paid === undefined ? undefined : String(fee_paid),
      age_mismatch: age_mismatch ? "true" : undefined,
      // "all" is not a value the server knows; it is the absence of a filter.
      self_outcome: self_outcome || undefined,
    },
  })
  return res.data.data
}

export const fetchApplicationDetailApi = async (
  applicationId: string
): Promise<ApplicationDetail> => {
  const res = await api.get(`/recruitments/applications/${applicationId}/details`)
  return res.data.data
}

// ── Trial feedback (player) ─────────────────────────────────

/**
 * The player's own account of the trial.
 *
 * `attended: false` is a COMPLETE answer on its own - the server forces the
 * outcome blank and the rating null for it, so the client sends nothing else
 * and never makes somebody who missed the trial fill in a form about it.
 *
 * With `attended: true` the server requires BOTH an outcome and a rating.
 * A resubmit is allowed and updates in place.
 */
export type TrialFeedbackPayload = {
  attended: boolean
  outcome?: SelfReportedOutcome
  rating?: number
  feedback?: string
}

export type TrialFeedbackResponse = {
  attended_self_reported: boolean | null
  outcome_self_reported: SelfReportedOutcome | ""
  trial_rating: number | null
  trial_feedback: string
  feedback_at: string | null
}

export const submitTrialFeedbackApi = async (
  applicationId: string,
  payload: TrialFeedbackPayload
): Promise<TrialFeedbackResponse> => {
  const res = await api.post(
    `/recruitments/applications/${applicationId}/feedback`,
    payload
  )
  return res.data.data
}


// ── Withdraw (player) ─────────────────────────────────────────

export type WithdrawApplicationResponse = {
  application_id: string
  status: ApplicationStatus
}

export const withdrawApplicationApi = async (
  applicationId: string
): Promise<WithdrawApplicationResponse> => {
  const res = await api.post(
    `/recruitments/applications/${applicationId}/withdraw`
  )
  return res.data.data
}

// ── Org status changes (bulk + single) ────────────────────────

// What an org may SET — matches the backend's STATUS_CHANGE_TARGETS.
//
// The retired `invited` / `rejected` are not here and not in
// ApplicationStatus either. The SERVER still accepts them from a stale PWA
// and maps them (backend legacy_status.py); this client never sends them.
export type BulkStatusTarget =
  | "reviewing"
  | "shortlisted"
  | "trial_confirmed"
  | "not_shortlisted"
  | "selected"
  | "not_selected"

export type SingleStatusTarget = BulkStatusTarget

export type StatusChangeSkip = {
  id: string
  reason: "not_found" | "withdrawn" | "no_change"
}

export type BulkStatusResponse = {
  updated: string[]
  skipped: StatusChangeSkip[]
  status_counts: ApplicationStatusCounts
}

export const bulkUpdateApplicationStatusApi = async (
  recruitmentId: string,
  body: { applicationIds: string[]; status: BulkStatusTarget; note?: string }
): Promise<BulkStatusResponse> => {
  const res = await api.post(
    `/recruitments/${recruitmentId}/applications/bulk-status`,
    {
      application_ids: body.applicationIds,
      status: body.status,
      note: body.note ?? "",
    }
  )
  return res.data.data
}

export type SingleStatusResponse = {
  application_id: string
  status: ApplicationStatus
  status_counts: ApplicationStatusCounts
}

export const updateApplicationStatusApi = async (
  applicationId: string,
  body: { status: SingleStatusTarget; note?: string }
): Promise<SingleStatusResponse> => {
  const res = await api.post(
    `/recruitments/applications/${applicationId}/status`,
    { status: body.status, note: body.note ?? "" }
  )
  return res.data.data
}

// ── Trial fee (org) ─────────────────────────────────────
//
// Any org member may mark a fee — it is the person on the gate who knows,
// not the admin. Nothing anywhere reads these to decide whether somebody may
// be confirmed or selected.

export type ApplicationFeeResponse = {
  application_id: string
  fee_paid: boolean
  fee_paid_at: string | null
}

export const updateApplicationFeeApi = async (
  applicationId: string,
  feePaid: boolean,
): Promise<ApplicationFeeResponse> => {
  const res = await api.patch(
    `/recruitments/applications/${applicationId}/fee`,
    { fee_paid: feePaid },
  )
  return res.data.data
}

export type BulkFeeResponse = {
  updated: string[]
  skipped: StatusChangeSkip[]
}

export const bulkUpdateApplicationFeeApi = async (
  recruitmentId: string,
  body: { applicationIds: string[]; feePaid: boolean },
): Promise<BulkFeeResponse> => {
  const res = await api.post(
    `/recruitments/${recruitmentId}/applications/bulk-fee`,
    { application_ids: body.applicationIds, fee_paid: body.feePaid },
  )
  return res.data.data
}
