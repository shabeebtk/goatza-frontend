/**
 * Wizard draft → the shape the real listing surfaces render.
 *
 * `RecruitmentCard` takes a full `Recruitment`, so the review step and the
 * live preview build one from the draft rather than re-implementing the card.
 * The values here are what the SERVER would hand back for this draft — the
 * same conversions `buildPayload` does on the way out (trimming, [] for "any
 * position", end-of-day dates), read back into the list/detail shape.
 *
 * Nothing in here touches the network or the payload: it is a view of the
 * draft, and a blank draft produces a blank-but-valid recruitment the card
 * renders with its own "—" placeholders.
 */

import type {
    Recruitment,
    RecruitmentAgeCategory,
    RecruitmentBenefit,
    RecruitmentContact,
    RecruitmentEligibilityCriteria,
    RecruitmentOrganization,
    RecruitmentRequirement,
    RecruitmentSport,
    RecruitmentStatus,
} from "../../services/recruitments.api"
import type { RecruitmentDraft } from "./draft"
import { localInputToISO } from "./wizardDate"

/** The bits of the listing the draft does not know about. */
export type PreviewContext = {
    organization: RecruitmentOrganization
    /** The chosen sport, or null while none is picked. */
    sport: RecruitmentSport | null
    /** Object URLs for un-uploaded photos, remote URLs for existing ones. */
    mediaPreviews: string[]
    /** Editing: keep the real id and status so the card reads the same. */
    id?: string
    status?: RecruitmentStatus
    createdAt?: string
}

/**
 * A `Recruitment` plus the detail-only facts the review block shows. The card
 * reads the base; the detail block reads the rest.
 */
export type PreviewRecruitment = Recruitment & {
    description: string
    venue_link: string
    apply_method: RecruitmentDraft["applyMethod"]
    external_apply_url: string
    payment_note: string
    max_applications: number | null
    age_categories: RecruitmentAgeCategory[]
    eligibility_criteria: RecruitmentEligibilityCriteria[]
    benefits: RecruitmentBenefit[]
    requirements: RecruitmentRequirement[]
    contacts: RecruitmentContact[]
    questions_count: number
    media_previews: string[]
    /** Where the venue is, as the detail page would show it. */
    location_name: string
}

export const PREVIEW_ID = "preview"

const PLACEHOLDER_SPORT: RecruitmentSport = { id: "", name: "", icon_name: "", icon_url: "" }

export function draftToPreviewRecruitment(
    draft: RecruitmentDraft,
    ctx: PreviewContext,
): PreviewRecruitment {
    const city = draft.location ? (draft.location.city || draft.location.name) : ""
    const ageCategories: RecruitmentAgeCategory[] = draft.allAges
        ? []
        : draft.ageCategories.map((g, idx) => ({
            id: g.serverId ?? g.id,
            title: g.title.trim(),
            min_birth_year: g.min_birth_year,
            max_birth_year: g.max_birth_year,
            reporting_time: g.showReportingTime && g.reporting_time ? `${g.reporting_time}:00` : null,
            display_order: idx,
        }))

    return {
        id: ctx.id ?? PREVIEW_ID,
        title: draft.title.trim(),
        short_description: draft.shortDesc.trim(),
        recruitment_type: draft.recruitmentType,
        status: ctx.status ?? "active",
        visibility: draft.visibility,
        city,
        applications_count: 0,
        event_date: localInputToISO(draft.eventDate) ?? "",
        created_at: ctx.createdAt ?? new Date().toISOString(),
        organization: ctx.organization,
        sport: ctx.sport ?? PLACEHOLDER_SPORT,
        positions: draft.anyPosition
            ? []
            : draft.selectedPositions.map(p => ({ position: { id: p.position_id, name: p.name }, is_primary: false })),
        age_categories: ageCategories,
        application_deadline: localInputToISO(draft.applicationDeadline) ?? null,
        is_paid: draft.isPaid,
        fee_amount: draft.isPaid && draft.feeAmount ? draft.feeAmount : null,
        fee_currency: draft.isPaid ? draft.feeCurrency : "",
        venue_name: draft.venueName.trim(),
        gender: draft.gender,
        is_saved: false,
        is_trial_over: false,

        description: draft.description.trim(),
        venue_link: draft.venueLink.trim(),
        apply_method: draft.applyMethod,
        external_apply_url: draft.applyMethod === "external" ? draft.externalApplyUrl.trim() : "",
        payment_note: draft.isPaid ? draft.paymentNote.trim() : "",
        max_applications: draft.maxApplications ? Number(draft.maxApplications) : null,
        eligibility_criteria: draft.eligibilityCriteria
            .filter(c => c.title.trim())
            .map((c, idx) => ({ id: c.id, title: c.title.trim(), display_order: idx })),
        benefits: draft.benefits
            .filter(b => b.title.trim())
            .map((b, idx) => ({ id: b.id, title: b.title.trim(), icon_name: b.icon_name, display_order: idx })),
        requirements: draft.requirements
            .filter(r => r.title.trim())
            .map((r, idx) => ({ id: r.id, title: r.title.trim(), is_mandatory: r.is_mandatory, display_order: idx })),
        contacts: draft.contacts
            .filter(c => c.value.trim())
            .map(c => ({ id: c.id, name: c.name.trim(), contact_type: c.contact_type, value: c.value.trim() })),
        questions_count: draft.questions.filter(q => q.question.trim()).length,
        media_previews: ctx.mediaPreviews,
        location_name: draft.location?.name ?? "",
    }
}

/** What a listing is still missing — informational, never blocking. */
export type MissingItem = { key: "photos" | "deadline" | "location" | "contact" | "description" | "tagline"; label: string }

export function missingFromDraft(draft: RecruitmentDraft, mediaCount: number): MissingItem[] {
    const out: MissingItem[] = []
    if (mediaCount === 0) out.push({ key: "photos", label: "No photos — listings with a photo get opened far more" })
    if (!draft.location) out.push({ key: "location", label: "No location — players nearby won't find it" })
    if (!draft.applicationDeadline) out.push({ key: "deadline", label: "No deadline — applications stay open until the event" })
    if (!draft.description.trim()) out.push({ key: "description", label: "No full description" })
    if (!draft.shortDesc.trim()) out.push({ key: "tagline", label: "No card tagline" })
    if (draft.contacts.filter(c => c.value.trim()).length === 0) out.push({ key: "contact", label: "No contact — players can't reach you with questions" })
    return out
}
