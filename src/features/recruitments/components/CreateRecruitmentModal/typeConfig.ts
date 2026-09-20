/**
 * What changes per recruitment type — ONE table.
 *
 * The wizard's six steps are the same rooms for every type; a type only
 * relabels the dates and hides the odd field that makes no sense for it
 * (nobody brings kit to a "player looking" post). Everything type-specific
 * reads from here, so tuning a label or hiding one more field is a one-line
 * change and never a hunt through the component.
 */

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

export const ALL_STEPS: StepKey[] = ["basics", "when_where", "who", "pitch", "apply", "publish"]

export type TypeConfig = {
    label: string
    /** One line on the picker card: when to use this type. */
    blurb: string
    /** Iconify name. */
    icon: string
    dateLabel: string
    deadlineLabel: string
    steps: StepKey[]
    /** Field blocks hidden inside a shown step. */
    hideFields?: HideableField[]
}

export const TYPE_CONFIG: Record<RecruitmentType, TypeConfig> = {
    open_trial: {
        label: "Open Trial",
        blurb: "Anyone can turn up and be assessed on the day. Selections, academy intakes, open trials.",
        icon: "mdi:whistle-outline",
        dateLabel: "Trial date",
        deadlineLabel: "Application deadline",
        steps: ALL_STEPS,
    },
    scholarship: {
        label: "Scholarship",
        blurb: "A funded place at your academy or school, awarded after a selection.",
        icon: "mdi:school-outline",
        dateLabel: "Selection date",
        deadlineLabel: "Application deadline",
        steps: ALL_STEPS,
    },
    direct_recruitment: {
        label: "Direct Recruitment",
        blurb: "You know the profile you want — sign a player straight into the squad, no trial day.",
        icon: "mdi:account-arrow-right-outline",
        dateLabel: "Start date",
        deadlineLabel: "Apply by",
        steps: ALL_STEPS,
        hideFields: ["requirements"],
    },
    player_looking: {
        label: "Player Looking",
        blurb: "A specific gap in your squad — a goalkeeper, a left-back — that you want filled.",
        icon: "mdi:account-search-outline",
        dateLabel: "Available from",
        deadlineLabel: "Apply by",
        steps: ALL_STEPS,
        hideFields: ["positions", "entry_fee", "requirements"],
    },
}

/** Card order on the picker screen. */
export const TYPE_ORDER: RecruitmentType[] = [
    "open_trial",
    "scholarship",
    "direct_recruitment",
    "player_looking",
]

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
    experience_level: "basics",
    event_date: "when_where",
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
