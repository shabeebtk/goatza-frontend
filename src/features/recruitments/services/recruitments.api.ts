import api from "@/core/api/axios"

// ── Enums ─────────────────────────────────────────────────────

export type RecruitmentType =
  | "open_trial"
  | "player_looking"
  | "direct_recruitment"
  | "scholarship"

export type RecruitmentStatus = "draft" | "active" | "closed" | "cancelled"

export type RecruitmentVisibility = "public" | "followers_only" | "private"

export type RecruitmentGender = "male" | "female" | "all"

export type ApplicationStatus =
  | "applied"
  | "reviewing"
  | "shortlisted"
  | "invited"
  | "selected"
  | "rejected"
  | "withdrawn"

export type QuestionFieldType =
  | "short_text"
  | "long_text"
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

export type MyApplication = {
  id: string
  status: ApplicationStatus
  applied_at: string
  updated_at: string
  age_category: ApplicationAgeCategory | null
}

// ── List item (lightweight) ───────────────────────────────────

export type Recruitment = {
  id: string
  title: string
  short_description: string
  recruitment_type: RecruitmentType
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
  // Match context (§5). Present on /discover and on the ranked "All" tab;
  // absent on the org-scoped mounts, which stay newest-first and unscored.
  // Every field is optional for exactly that reason — a card must render fine
  // with none of them.
  match?: RecruitmentMatchContext
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
 
export type RecruitmentDetail = {
  id: string
  title: string
  short_description: string
  description: string
  recruitment_type: RecruitmentType
  visibility: RecruitmentVisibility
  apply_method: "goatza" | "external" | "contact"
  gender: RecruitmentGender | ""
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
  created_at: string
 
  // Org-owner-only fields (present when viewer is the org admin)
  status?: RecruitmentStatus
  max_applications?: number | null
  shortlisted_count?: number
  selected_count?: number
  views_count?: number
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
  benefits?: CreateRecruitmentBenefitPayload[]
  requirements?: CreateRecruitmentRequirementPayload[]
  eligibility_criteria?: CreateRecruitmentEligibilityCriteriaPayload[]
  contacts?: CreateRecruitmentContactPayload[]
  questions?: CreateRecruitmentQuestionPayload[]
  media?: CreateRecruitmentMediaPayload[]
}

export type CreateRecruitmentResponse = {
  recruitment_id: string
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
  recruitment_type: RecruitmentType
  status: RecruitmentStatus
  city: string
  event_date: string | null
  application_deadline: string | null
  organization: ApplicationOrgSummary
  sport: RecruitmentSport
}

export type MyApplicationListItem = {
  id: string
  status: ApplicationStatus
  applied_at: string
  updated_at: string
  recruitment: MyApplicationRecruitment
  age_category: ApplicationAgeCategory | null
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
}

export type ApplicationAnswer = {
  question: string
  field_type: QuestionFieldType
  answer_text: string
  selected_options: string[]
}

export type ApplicationDetail = ApplicantListItem & {
  answers: ApplicationAnswer[]
}

// Every application status → count for the recruitment (zeros included).
export type ApplicationStatusCounts = Record<ApplicationStatus, number>

export type RecruitmentApplicantsResponse = {
  count: number
  limit: number
  offset: number
  results: ApplicantListItem[]
  status_counts: ApplicationStatusCounts
}

export type FetchRecruitmentApplicantsParams = {
  status?: ApplicationStatus
  search?: string
  // Age-group id. The backend ignores an id it doesn't own, same as status.
  age_category?: string
  limit?: number
  offset?: number
}

export const fetchRecruitmentApplicantsApi = async (
  recruitmentId: string,
  params: FetchRecruitmentApplicantsParams
): Promise<RecruitmentApplicantsResponse> => {
  const res = await api.get(`/recruitments/${recruitmentId}/applications`, { params })
  return res.data.data
}

export const fetchApplicationDetailApi = async (
  applicationId: string
): Promise<ApplicationDetail> => {
  const res = await api.get(`/recruitments/applications/${applicationId}/details`)
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

// Org status targets — bulk + single share the same set. `invited` is NOT an
// org target (reserved for the future personal-invite feature).
export type BulkStatusTarget = "reviewing" | "shortlisted" | "selected" | "rejected"
export type SingleStatusTarget = "reviewing" | "shortlisted" | "selected" | "rejected"

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