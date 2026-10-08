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
    RecruitmentCoverMedia,
    RecruitmentBenefit,
    RecruitmentContact,
    RecruitmentEligibilityCriteria,
    RecruitmentOrganization,
    RecruitmentRequirement,
    RecruitmentSport,
    RecruitmentStatus,
} from "../../services/recruitments.api"
import { FALLBACK_TRIAL_TIME_ZONE } from "../../trialEnded"
import type { RecruitmentDraft } from "./draft"
import { liveSessions, shapeFromSessions } from "./sessions"
import { localInputToISO } from "./wizardDate"

/** The bits of the listing the draft does not know about. Module-private:
 *  callers pass an object literal to draftToPreviewRecruitment. */
type PreviewContext = {
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

// Module-private: the id only matters inside the preview it names.
const PREVIEW_ID = "preview"

const PLACEHOLDER_SPORT: RecruitmentSport = { id: "", name: "", icon_name: "", icon_url: "" }

export function draftToPreviewRecruitment(
    draft: RecruitmentDraft,
    ctx: PreviewContext,
): PreviewRecruitment {
    const city = draft.location ? (draft.location.city || draft.location.name) : ""
    const cover = ctx.mediaPreviews[0]
    const coverMedia: RecruitmentCoverMedia | null = cover
        ? { media_type: "image", file_url: cover, thumbnail_url: cover }
        : null
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
        // The wizard has no timezone setter — the server copies the org's own
        // onto the row. The preview's dates are the bare days just typed,
        // which read the same in any zone within half a day of UTC, so the
        // fallback here is honest rather than a guess at the org's zone.
        timezone: FALLBACK_TRIAL_TIME_ZONE,
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
        // THE PHOTO THE CARD RENDERS. Without these two the review step
        // showed the org a card with the no-cover panel on it — the sport
        // watermark — however many photos they had just uploaded, under a
        // heading reading “this is what players will see”, which was the one
        // thing on that screen it had to get right.
        //
        // The first preview IS the cover (same rule the server applies to the
        // uploaded set), and it is handed over as both the full file and the
        // thumb because a local object URL has no second size. mediaDelivery
        // passes `blob:` and `data:` through verbatim, which is what makes an
        // un-uploaded pick renderable here at all.
        cover_media: coverMedia,
        media_count: ctx.mediaPreviews.length,

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
        // Only the in-app flow asks them, so only it counts them — same rule
        // as `external_apply_url` above, and the same rule buildPayload sends.
        questions_count: draft.applyMethod === "goatza"
            ? draft.questions.filter(q => q.question.trim()).length
            : 0,
        media_previews: ctx.mediaPreviews,
        location_name: draft.location?.name ?? "",
    }
}

/** What a listing is still missing — informational, never blocking. */
export type MissingItem = { key: "photos" | "deadline" | "location" | "contact" | "description" | "tagline"; label: string }

export function missingFromDraft(draft: RecruitmentDraft, mediaCount: number): MissingItem[] {
    const out: MissingItem[] = []
    if (mediaCount === 0) out.push({ key: "photos", label: "No photos — listings with a photo get opened far more" })
    // SEVERAL PLACES has no trial-level location — every centre carries its
    // own and the step never asks for one, so the nudge reads the rows. Read
    // off the trial otherwise, which is where those two shapes keep it.
    const shape = draft.trialShape ?? shapeFromSessions(draft.sessions)
    const hasPlace = shape === "multi_place"
        ? liveSessions(draft.sessions).some(row => row.location !== null)
        : draft.location !== null
    if (!hasPlace) out.push({ key: "location", label: "No location — players nearby won't find it" })
    if (!draft.applicationDeadline) out.push({ key: "deadline", label: "No deadline — applications stay open until the event" })
    if (!draft.description.trim()) out.push({ key: "description", label: "No full description" })
    if (!draft.shortDesc.trim()) out.push({ key: "tagline", label: "No card tagline" })
    if (draft.contacts.filter(c => c.value.trim()).length === 0) out.push({ key: "contact", label: "No contact — players can't reach you with questions" })
    return out
}
