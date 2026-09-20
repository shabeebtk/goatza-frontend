/**
 * The wizard's in-progress shapes — what CreateRecruitmentModal holds in state
 * while a recruitment is being authored. Pure types, no React.
 *
 * Kept apart from the component so `buildPayload` (the state → request body
 * step) can be tested without rendering anything, and so the live preview can
 * read the same draft the form writes.
 */

import type { PlaceResult } from "@/shared/services/places.service"
import type { ApplyMethod } from "../../services/recruitments.api"
import type { AgeGroupDraft } from "../../eligibility"

export type RecruitmentType = "open_trial" | "player_looking" | "direct_recruitment" | "scholarship"
export type RecruitmentVisibility = "public" | "followers_only" | "private"
export type RecruitmentGender = "male" | "female" | "all"
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
    experienceLevel: string
    /** Wizard date value: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", or "". */
    applicationDeadline: string
    eventDate: string
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
