/**
 * What changes per recruitment type — ONE table.
 *
 * The wizard's six steps are the same rooms for every type; a type only
 * relabels the dates and hides the odd field that makes no sense for it
 * (nobody brings kit to a "looking for players" post). Everything
 * type-specific reads from here, so tuning a label or hiding one more field is
 * a one-line change and never a hunt through the component.
 *
 * Two types. Scholarship and direct recruitment were retired: a scholarship
 * is a benefit on an open trial, a direct signing is a "looking for players"
 * post. `toCreatableType` folds a legacy value read back from the API into
 * the type the wizard can save — the same rule the data migration applies.
 */

import type { RecruitmentTypeValue } from "../../services/recruitments.api"
import { RECRUITMENT_TYPES, TYPE_LABEL } from "../../recruitmentCopy"
import type { RecruitmentType } from "./draft"

export type StepKey = "basics" | "when_where" | "who" | "pitch" | "apply" | "publish"

/** Field blocks a type may hide inside a step it still shows. */
export type HideableField = "positions" | "entry_fee" | "requirements"

export const STEP_META: Record<StepKey, { label: string; title: string; blurb: string }> = {
    basics: {
        label: "Basics",
        title: "The basics",
        blurb: "What it is and what it's called.",
    },
    when_where: {
        label: "When & where",
        title: "When & where",
        blurb: "Date, deadline and the ground — this is what makes it findable nearby.",
    },
    who: {
        label: "Who can come",
        title: "Who can come",
        blurb: "Shown on the listing as written. Goatza never checks a player against it — you verify at the venue.",
    },
    pitch: {
        label: "The pitch",
        title: "The pitch",
        blurb: "Photos, the full story, and what selected players get.",
    },
    apply: {
        label: "How they apply",
        title: "How they apply",
        blurb: "Where applications go, what you ask, and any fee.",
    },
    publish: {
        label: "Publish",
        title: "Review & publish",
        blurb: "This is what players will see.",
    },
}

// Module-private: the two TYPE_CONFIG entries below are its only readers.
const ALL_STEPS: StepKey[] = ["basics", "when_where", "who", "pitch", "apply", "publish"]

export type TypeConfig = {
    /** TYPE_LABEL's wording — never a local copy. */
    label: string
    /** One line on the picker card: when to use this type. */
    blurb: string
    /** Iconify name. */
    icon: string
    /**
     * Whether the type has a trial day at all. Without one the date field is
     * not shown, not required and never sent — the deadline is the only date.
     */
    hasTrialDate: boolean
    /**
     * Whether the type has TRIAL DATES - the repeater, the mode selector and
     * the auto-confirm toggle.
     *
     * It tracks `hasTrialDate` today and may always do so, but they are
     * different questions ("does it have a date at all" vs "does it have a
     * list of them"), so it gets its own field rather than every call site
     * branching on the slug.
     */
    hasSessions: boolean
    dateLabel: string
    deadlineLabel: string
    /** Positions ARE the posting ("we need a goalkeeper"): shown first on
     *  their step, and at least one must be picked. */
    positionsRequired: boolean
    steps: StepKey[]
    /** Field blocks hidden inside a shown step. */
    hideFields?: HideableField[]
}

export const TYPE_CONFIG: Record<RecruitmentType, TypeConfig> = {
    open_trial: {
        label: TYPE_LABEL.open_trial,
        blurb: "Anyone can turn up and be assessed on the day. Selections, academy intakes, scholarship trials.",
        icon: "mdi:whistle-outline",
        hasTrialDate: true,
        hasSessions: true,
        dateLabel: "Trial date",
        deadlineLabel: "Application deadline",
        positionsRequired: false,
        steps: ALL_STEPS,
    },
    player_looking: {
        label: TYPE_LABEL.player_looking,
        blurb: "A specific gap in your squad — a goalkeeper, a left-back — that you want filled.",
        icon: "mdi:account-search-outline",
        hasTrialDate: false,
        hasSessions: false,
        dateLabel: "Trial date",
        deadlineLabel: "Application deadline",
        positionsRequired: true,
        steps: ALL_STEPS,
        hideFields: ["entry_fee", "requirements"],
    },
}

/** Card order on the picker screen. */
export const TYPE_ORDER: RecruitmentType[] = RECRUITMENT_TYPES

/**
 * A type read back from the API, as one the wizard can save. Legacy values
 * fold exactly the way migrate_recruitment_v3 folds them: a trial day makes it
 * an open trial, no trial day makes it a "looking for players" post.
 */
export function toCreatableType(
    type: RecruitmentTypeValue,
    eventDate: string | null | undefined,
): RecruitmentType {
    if (type === "open_trial" || type === "player_looking") return type
    return eventDate ? "open_trial" : "player_looking"
}

/**
 * Backend field-error key → the step that owns the input, so a 400 can jump
 * the user to the offending screen and show the message inline. Keyed by
 * step NAME, not index: the index is resolved against the type's own step
 * list at the moment of the error.
 */
export const FIELD_STEP_KEY: Record<string, StepKey> = {
    title: "basics",
    short_description: "basics",
    sport_id: "basics",
    recruitment_type: "basics",
    event_date: "when_where",
    sessions: "when_where",
    session_mode: "when_where",
    auto_confirm: "apply",
    application_deadline: "when_where",
    venue_name: "when_where",
    venue_link: "when_where",
    location: "when_where",
    requirements: "when_where",
    age_categories: "who",
    gender: "who",
    positions: "who",
    eligibility_criteria: "who",
    description: "pitch",
    media: "pitch",
    benefits: "pitch",
    apply_method: "apply",
    external_apply_url: "apply",
    contacts: "apply",
    questions: "apply",
    is_paid: "apply",
    fee_amount: "apply",
    fee_currency: "apply",
    payment_note: "apply",
    max_applications: "apply",
    visibility: "publish",
}
