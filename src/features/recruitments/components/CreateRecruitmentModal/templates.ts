/**
 * Seed templates — a head start for an org with no recruitments to repeat.
 *
 * Each one prefills the wizard the way a past recruitment would: type, age
 * groups, what to bring and two or three questions worth asking. Nothing is
 * submitted; the user lands on the first step with the fields filled and
 * edits from there. Kept here, not in the wizard, so the copy can be tuned
 * without touching the component.
 *
 * Age groups are given as "U<age>" presets and resolved against the current
 * year when applied, so a template never goes stale.
 */

import type { QuestionFieldType, RecruitmentType } from "./draft"

export type TemplateQuestion = {
    question: string
    field_type: QuestionFieldType
    is_required: boolean
    options?: string[]
}

export type RecruitmentTemplate = {
    key: string
    label: string
    /** One line on the picker: who this is for. */
    blurb: string
    /** Iconify name. */
    icon: string
    type: RecruitmentType
    /** Suggested title; the wizard's own suggestion replaces it once a sport is picked. */
    title?: string
    shortDesc?: string
    /** Resolved against the sports list by name; ignored when not found. */
    sportName?: string
    /** Resolved against the chosen sport's positions by name. */
    positionNames?: string[]
    /** "U17" style presets (max age), or a custom open-ended group. */
    ageGroups: Array<{ preset: number } | { title: string; minAge?: number; maxAge?: number }>
    requirements: Array<{ title: string; mandatory?: boolean }>
    questions: TemplateQuestion[]
    benefits?: Array<{ title: string; icon: string }>
    criteria?: string[]
}

export const RECRUITMENT_TEMPLATES: RecruitmentTemplate[] = [
    {
        key: "open_trial",
        label: "Open Trial",
        blurb: "U15–U19, the usual paperwork, three quick questions.",
        icon: "mdi:whistle-outline",
        type: "open_trial",
        title: "Open Trial",
        shortDesc: "Open selection — turn up, play, get seen.",
        ageGroups: [{ preset: 15 }, { preset: 17 }, { preset: 19 }],
        requirements: [
            { title: "Aadhaar Card" },
            { title: "Football Kit & Boots" },
            { title: "Passport Photo" },
        ],
        questions: [
            { question: "Which club or school do you currently play for?", field_type: "short_text", is_required: true },
            { question: "Preferred foot", field_type: "radio", is_required: false, options: ["Left", "Right", "Both"] },
            { question: "Have you played at district level or above?", field_type: "radio", is_required: false, options: ["Yes", "No"] },
        ],
    },
    {
        key: "academy_intake",
        label: "Academy Intake",
        blurb: "Younger age groups, parent contact, school documents.",
        icon: "mdi:school-outline",
        type: "open_trial",
        title: "Academy Intake",
        shortDesc: "Year-round academy places for U13 and U15.",
        ageGroups: [{ preset: 13 }, { preset: 15 }],
        requirements: [
            { title: "Birth Certificate" },
            { title: "School ID / TC" },
            { title: "Medical Fitness Certificate", mandatory: false },
        ],
        questions: [
            { question: "Parent / guardian phone number", field_type: "short_text", is_required: true },
            { question: "Current school", field_type: "short_text", is_required: true },
            { question: "How many years have you been playing?", field_type: "number", is_required: false },
        ],
        benefits: [
            { title: "Professional coaching", icon: "coach" },
            { title: "Full training kit", icon: "kit" },
        ],
    },
    {
        key: "senior_selection",
        label: "Senior Selection",
        blurb: "U23 and seniors; asks for level played and history.",
        icon: "mdi:trophy-outline",
        type: "open_trial",
        title: "Senior Team Selection",
        shortDesc: "Selection for the senior squad — experienced players only.",
        ageGroups: [{ preset: 23 }, { title: "Senior", minAge: 19 }],
        requirements: [
            { title: "Aadhaar Card" },
            { title: "Previous Tournament Certificates", mandatory: false },
            { title: "Football Kit & Boots" },
        ],
        questions: [
            { question: "Highest level you have played at", field_type: "radio", is_required: true, options: ["District", "State", "National"] },
            { question: "Previous clubs (most recent first)", field_type: "long_text", is_required: false },
            { question: "Height in cm", field_type: "number", is_required: false },
        ],
        criteria: ["District-level experience required"],
    },
    {
        key: "goalkeeper_trial",
        label: "Goalkeeper Trial",
        blurb: "One position, U17–U21, height and level up front.",
        icon: "mdi:hand-back-left-outline",
        type: "open_trial",
        title: "Goalkeeper Trial",
        shortDesc: "Looking for goalkeepers — U17 to U21.",
        sportName: "Football",
        positionNames: ["Goalkeeper"],
        ageGroups: [{ preset: 17 }, { preset: 19 }, { preset: 21 }],
        requirements: [
            { title: "Football Kit & Boots" },
            { title: "Goalkeeper Gloves" },
            { title: "Aadhaar Card" },
        ],
        questions: [
            { question: "Height in cm", field_type: "number", is_required: true },
            { question: "Which club or school do you currently play for?", field_type: "short_text", is_required: false },
            { question: "Highest level you have played at", field_type: "radio", is_required: false, options: ["School", "District", "State", "National"] },
        ],
    },
]
