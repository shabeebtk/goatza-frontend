/**
 * The wizard's in-progress shapes — what CreateRecruitmentModal holds in state
 * while a recruitment is being authored. Pure types, no React.
 *
 * Kept apart from the component so `buildPayload` (the state → request body
 * step) can be tested without rendering anything, and so the live preview can
 * read the same draft the form writes.
 */

import type { PlaceResult } from "@/shared/services/places.service"
import type { ApplyMethod, RecruitmentType, SessionMode } from "../../services/recruitments.api"
import type { SessionDraft, TrialShape } from "./sessions"
import type { AgeGroupDraft } from "../../eligibility"

// The creatable union lives with the API types; re-exported so the wizard's
// files keep importing their shapes from one place.
export type { RecruitmentType }
export type RecruitmentVisibility = "public" | "followers_only" | "private"
export type RecruitmentGender = "male" | "female" | "all"
// "select" is LEGACY, READ-ONLY: not offered in FIELD_TYPES, normalised to
// "radio" by mapInitialQuestions, and kept only because stored rows have it.
export type QuestionFieldType = "short_text" | "long_text" | "select" | "radio" | "checkbox" | "number"

export type QuestionDraft = {
    id: string
    question: string
    field_type: QuestionFieldType
    is_required: boolean
    options: { value: string }[]
}

export type EligibilityCriteriaDraft = {
    id: string
    title: string
    display_order: number
}

export type BenefitDraft = {
    id: string
    title: string
    icon_name: string
    display_order: number
}

export type RequirementDraft = {
    id: string
    title: string
    is_mandatory: boolean
    display_order: number
}

export type ContactDraft = {
    id: string
    name: string
    contact_type: "phone" | "email"
    value: string
}

export type PositionItem = { position_id: string; name: string }

/**
 * Everything `buildPayload` reads. Media is NOT here: it is resolved
 * asynchronously during submit (existing + freshly uploaded) and passed in
 * separately.
 */
export type RecruitmentDraft = {
    title: string
    shortDesc: string
    description: string
    recruitmentType: RecruitmentType
    visibility: RecruitmentVisibility
    gender: RecruitmentGender
    sportId: string
    /** Wizard date value: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", or "". */
    applicationDeadline: string
    /**
     * The legacy single trial date. Still in the draft because the preview
     * and the deadline rules read it, but an open trial's real dates are
     * `sessions` and the server DERIVES event_date from the first of them.
     */
    eventDate: string
    /** The trial's dates. One row by default; an open trial needs one. */
    sessions: SessionDraft[]
    /**
     * Which of the three formats this trial is — see sessions.ts. It decides
     * the mode the payload sends, not just which fields the step shows.
     *
     * Optional because it is DERIVABLE: a draft without one falls back to
     * `shapeFromSessions`, which reads the shape off the rows themselves.
     */
    trialShape?: TrialShape
    /** Only meaningful for multi_day; the other shapes imply their mode. */
    sessionMode: SessionMode
    /** Open trial only. Everyone who applies is confirmed instantly. */
    autoConfirm: boolean
    maxApplications: string
    isPaid: boolean
    feeAmount: string
    feeCurrency: string
    paymentNote: string
    applyMethod: ApplyMethod
    externalApplyUrl: string
    venueName: string
    venueLink: string
    location: PlaceResult | null
    anyPosition: boolean
    selectedPositions: PositionItem[]
    ageCategories: AgeGroupDraft[]
    allAges: boolean
    eligibilityCriteria: EligibilityCriteriaDraft[]
    benefits: BenefitDraft[]
    requirements: RequirementDraft[]
    contacts: ContactDraft[]
    questions: QuestionDraft[]
}
