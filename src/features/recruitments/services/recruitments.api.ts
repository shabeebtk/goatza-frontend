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

export type MyApplication = {
  id: string
  status: ApplicationStatus
  applied_at: string
  updated_at: string
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
}

// ── Detail (full — user + org-owner fields) ───────────────────

export type RecruitmentAgeCategory = {
  id: string
  title: string
  min_birth_year: number
  max_birth_year: number
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
  is_primary: boolean
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

export type CreateRecruitmentLocationPayload = {
  name?: string
  city?: string
  country_code?: string
  latitude?: number
  longitude?: number
}

export type CreateRecruitmentAgeCategoryPayload = {
  title: string
  min_birth_year: number
  max_birth_year: number
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
  age_categories?: CreateRecruitmentAgeCategoryPayload[]
  benefits?: CreateRecruitmentBenefitPayload[]
  requirements?: CreateRecruitmentRequirementPayload[]
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