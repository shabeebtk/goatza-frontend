/**
 * Wizard draft → the create/update request body.
 *
 * The one function that decides what the server receives. Extracted from the
 * modal so it can be characterised by a test that survives any amount of
 * screen reshuffling: which step an input sits on is a UI choice, what gets
 * sent is not.
 *
 * Shared by create and edit; `media` is passed in because it is resolved
 * asynchronously during submit (existing + freshly uploaded).
 */

import type {
    CreateRecruitmentPayload,
    CreateRecruitmentMediaPayload,
} from "../../services/recruitments.api"
import { buildAgeCategoriesPayload } from "../../eligibility"
import type { RecruitmentDraft } from "./draft"
import { localInputToISO } from "./wizardDate"

export function buildPayload(
    draft: RecruitmentDraft,
    media: CreateRecruitmentMediaPayload[],
    submitStatus?: "draft" | "active",
): CreateRecruitmentPayload {
    const {
        title, shortDesc, description, recruitmentType, visibility, gender, sportId,
        experienceLevel, applicationDeadline, eventDate, maxApplications,
        isPaid, feeAmount, feeCurrency, paymentNote, applyMethod, externalApplyUrl,
        venueName, venueLink, location, anyPosition, selectedPositions,
        ageCategories, allAges, eligibilityCriteria, benefits, requirements,
        contacts, questions,
    } = draft

    return {
        title: title.trim(),
        short_description: shortDesc.trim(),
        description: description.trim() || undefined,
        recruitment_type: recruitmentType,
        visibility,
        gender,
        sport_id: sportId,
        experience_level: experienceLevel || undefined,
        application_deadline: localInputToISO(applicationDeadline),
        event_date: localInputToISO(eventDate),
        max_applications: maxApplications ? Number(maxApplications) : undefined,
        is_paid: isPaid,
        fee_amount: isPaid && feeAmount ? feeAmount : undefined,
        fee_currency: isPaid ? feeCurrency : undefined,
        payment_note: isPaid && paymentNote ? paymentNote.trim() : undefined,
        apply_method: applyMethod,
        external_apply_url: applyMethod === "external" ? (externalApplyUrl.trim() || undefined) : undefined,
        // status: sent when the caller asks for one — every create (draft /
        // active), and an edit ONLY when it is publishing a saved draft. An
        // edit of a live recruitment sends no status key at all.
        ...(submitStatus ? { status: submitStatus } : {}),
        venue_name: venueName.trim() || undefined,
        venue_link: venueLink.trim() || undefined,
        location: location ? {
            // provider + external_id are NEW here: this payload used to drop
            // the place id entirely, so every recruitment minted its own
            // Location row and none of them could ever be refreshed by id.
            provider: location.provider,
            external_id: location.external_id,
            name: location.name,
            type: location.place_type,
            // `city` must never be undefined — the nested serializer treats a
            // missing city as a validation error. Google usually resolves a
            // real locality now; the place name is the fallback when it does
            // not (a ground outside any named town).
            city: location.city || location.name,
            state: location.state,
            country: location.country,
            country_code: location.country_code,
            latitude: location.latitude,
            longitude: location.longitude,
        } : undefined,
        // send [] if "Any" is selected, otherwise the selected list
        positions: anyPosition
            ? []
            : selectedPositions.map(p => ({ position_id: p.position_id })),
        // "Open to all ages" → an empty list. Otherwise every already-saved
        // group carries its server id so the backend updates it in place.
        age_categories: buildAgeCategoriesPayload(ageCategories, allAges),
        eligibility_criteria: eligibilityCriteria
            .filter(c => c.title.trim())
            .map((c, idx) => ({ title: c.title.trim(), display_order: idx })),
        benefits: benefits
            .filter(b => b.title.trim())
            .map((b, idx) => ({ title: b.title.trim(), icon_name: b.icon_name, display_order: idx })),
        requirements: requirements
            .filter(r => r.title.trim())
            .map((r, idx) => ({ title: r.title.trim(), is_mandatory: r.is_mandatory, display_order: idx })),
        contacts: contacts
            .filter(c => c.value.trim())
            .map(c => ({ name: c.name.trim(), contact_type: c.contact_type, value: c.value.trim() })),
        questions: questions
            .filter(q => q.question.trim())
            .map(q => ({
                question: q.question.trim(),
                field_type: q.field_type,
                is_required: q.is_required,
                options: q.options.filter(o => o.value.trim()).map(o => ({ value: o.value.trim() })),
            })),
        media: media.length > 0 ? media : undefined,
    }
}
