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
import {
    buildSessionsPayload,
    sessionModeForShape,
    shapeFromSessions,
} from "./sessions"
import { TYPE_CONFIG } from "./typeConfig"
import { localInputToISO } from "./wizardDate"

export function buildPayload(
    draft: RecruitmentDraft,
    media: CreateRecruitmentMediaPayload[],
    submitStatus?: "draft" | "active",
): CreateRecruitmentPayload {
    const {
        title, shortDesc, description, recruitmentType, visibility, gender, sportId,
        applicationDeadline, eventDate, maxApplications,
        isPaid, feeAmount, feeCurrency, paymentNote, applyMethod, externalApplyUrl,
        venueName, venueLink, location, anyPosition, selectedPositions,
        ageCategories, allAges, eligibilityCriteria, benefits, requirements,
        contacts, questions, sessions, sessionMode, trialShape, autoConfirm,
    } = draft

    // Trial DATES. Only a type that has them sends any, and a type that does
    // not sends the key as undefined rather than an empty array — an empty
    // array on an open trial is a validation error server-side, and on a
    // "looking for players" post there is nothing to delete.
    const hasSessions = TYPE_CONFIG[recruitmentType].hasSessions

    // WHICH SHAPE this trial is. A draft that carries no shape has it read
    // back off its rows — a row with its own venue is a centre, which makes
    // the trial a city tour whatever the draft forgot to say.
    const shape = trialShape ?? shapeFromSessions(sessions)

    // SEVERAL PLACES has no trial-level ground: every centre carries its own,
    // and the step hides the trial's location and venue fields entirely. A
    // value left behind by a switch INTO this shape must not ride along — it
    // would put a second, wrong venue on the listing and a pin in the wrong
    // city. The venue keys go out EMPTY rather than omitted, because an
    // omitted key on an update leaves whatever is already stored in place.
    const perCentreVenues = hasSessions && shape === "multi_place"

    return {
        title: title.trim(),
        short_description: shortDesc.trim(),
        description: description.trim() || undefined,
        recruitment_type: recruitmentType,
        visibility,
        gender,
        sport_id: sportId,
        // NO experience_level. The wizard retired the field into the criteria
        // presets and has no setter for it; the column and the server's filter
        // param both stay, so old rows keep their value — and an UPDATE that
        // omits the key leaves the stored value untouched (the serializer field
        // is required=False, so it never reaches update_recruitment's setattr
        // loop).
        application_deadline: localInputToISO(applicationDeadline),
        // Only a type with a trial day sends one. A date picked under another
        // type before switching must not ride along unseen. (On an edit the
        // omitted key leaves a stored value untouched.)
        event_date: TYPE_CONFIG[recruitmentType].hasTrialDate
            ? localInputToISO(eventDate)
            : undefined,
        // Every row keeps its server id, which is what makes an edit a
        // diff-sync instead of a delete-and-recreate — see sessions.ts.
        sessions: hasSessions ? buildSessionsPayload(sessions) : undefined,
        // The SHAPE decides the mode, not the row count: several centres
        // are always a pick-one, and one date is always "all". Only
        // multi_day leaves the question open, and there `sessionMode` is
        // the org's own answer.
        session_mode: hasSessions
            ? sessionModeForShape(shape, sessionMode)
            : undefined,
        auto_confirm: hasSessions ? autoConfirm : undefined,
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
        venue_name: perCentreVenues ? "" : (venueName.trim() || undefined),
        venue_link: perCentreVenues ? "" : (venueLink.trim() || undefined),
        // `location` has no null in the payload type, so a city tour simply
        // sends no location key. The wizard is the other half of this rule:
        // entering "several places" clears the trial's own place, so there is
        // nothing stale left to send.
        location: location && !perCentreVenues ? {
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
        // Custom questions are collected by the in-app apply form and nowhere
        // else, so any other method sends no `questions` key at all rather than
        // an empty array: the wizard keeps whatever was typed (a switch back to
        // Goatza restores it), and an edit that omits the key leaves a stored
        // set untouched — the same rule the other conditional fields follow.
        questions: applyMethod === "goatza"
            ? questions
                .filter(q => q.question.trim())
                .map(q => ({
                    question: q.question.trim(),
                    field_type: q.field_type,
                    is_required: q.is_required,
                    options: q.options.filter(o => o.value.trim()).map(o => ({ value: o.value.trim() })),
                }))
            : undefined,
        media: media.length > 0 ? media : undefined,
    }
}
