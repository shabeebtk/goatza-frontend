/**
 * Career — types + response schemas.
 *
 * The response schemas mirror `careers/serializers/career_serializers.py`. They
 * guard the SHAPE of what the API returns (so a backend change surfaces here,
 * loudly, instead of as `undefined` deep inside a component) — they are not a
 * second copy of the server's business rules.
 *
 * The FORM schema at the bottom is different in kind: it re-states the server's
 * rules on purpose, so the user is told about a bad date range before a round
 * trip. The server still enforces all of it — this only moves the message
 * earlier.
 */

import { z } from "zod"

// ── Enums (mirror the model's TextChoices) ────────────────────

export const CAREER_ENTRY_TYPES = [
    "club_team",
    "national_team",
    "loan",
    "academy",
    "school_college",
    "other",
] as const

export type CareerEntryType = (typeof CAREER_ENTRY_TYPES)[number]

export const DEFAULT_CAREER_ENTRY_TYPE: CareerEntryType = "club_team"

export const CAREER_SQUAD_LEVELS = ["youth", "reserve", "senior"] as const

export type CareerSquadLevel = (typeof CAREER_SQUAD_LEVELS)[number]

export const CAREER_VERIFICATION_STATUSES = [
    "self_reported",
    "pending",
    "verified",
    "rejected",
] as const

export type CareerVerificationStatus =
    (typeof CAREER_VERIFICATION_STATUSES)[number]

export const CAREER_SOURCES = ["manual", "recruitment"] as const

export type CareerSource = (typeof CAREER_SOURCES)[number]

/** Server rule: CareerVerificationService.MAX_REASON_LENGTH. */
export const MAX_REJECT_REASON_LENGTH = 200

/**
 * Server rule: CareerEntryService.MAX_ENTRIES. Mirrored here so the Add button
 * can go quiet at the cap instead of letting the user fill in a whole form the
 * server was always going to refuse.
 */
export const MAX_CAREER_ENTRIES = 10

/** How many entries the profile shows before "Show more". */
export const CAREER_PAGE_SIZE = 3

/** Server rule: the `title` column width. */
export const MAX_CAREER_TITLE_LENGTH = 100

/** Server rule: the `organization_name` column width. */
export const MAX_CAREER_ORGANIZATION_NAME_LENGTH = 150

/** Server rule: the `age_group` column width. */
export const MAX_CAREER_AGE_GROUP_LENGTH = 20

// ── Nested summaries ──────────────────────────────────────────

/**
 * The linked club, when the entry names one on Goatza. Shape of
 * `OrganizationMiniSerializer` — the same summary the rest of the app renders
 * an org with.
 *
 * `null` for a free-text entry (a club that isn't on Goatza) AND for one whose
 * club has since been deleted. `organization_name` on the entry survives both,
 * so ALWAYS print the name from there, never from here.
 */
export const careerOrganizationSchema = z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    type: z.string(),
    logo: z.string(),
    headline: z.string(),
    is_verified: z.boolean(),
})

export type CareerOrganization = z.infer<typeof careerOrganizationSchema>

export const careerSportSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon_name: z.string(),
    icon_url: z.string(),
})

export type CareerSport = z.infer<typeof careerSportSchema>

export const careerPositionSchema = z.object({
    id: z.string(),
    name: z.string(),
})

export type CareerPosition = z.infer<typeof careerPositionSchema>

// ── Career entry ──────────────────────────────────────────────

export const careerEntrySchema = z.object({
    id: z.string(),

    organization: careerOrganizationSchema.nullable(),
    /** Always present — synced from the org when linked, free text otherwise. */
    organization_name: z.string(),

    sport: careerSportSchema,
    title: z.string(),

    entry_type: z.enum(CAREER_ENTRY_TYPES),
    /** Blank string when the player didn't say. */
    squad_level: z.union([z.enum(CAREER_SQUAD_LEVELS), z.literal("")]),
    age_group: z.string(),

    positions: z.array(careerPositionSchema),

    /** ISO date, `YYYY-MM-DD`. */
    start_date: z.string(),
    end_date: z.string().nullable(),
    is_current: z.boolean(),

    description: z.string(),

    verification_status: z.enum(CAREER_VERIFICATION_STATUSES),
    verified_at: z.string().nullable(),
    source: z.enum(CAREER_SOURCES),

    created_at: z.string(),
    updated_at: z.string(),
})

export type CareerEntry = z.infer<typeof careerEntrySchema>

// ── List response ─────────────────────────────────────────────

export const careerListSchema = z.object({
    count: z.number(),
    /** True when the requesting actor owns this history (the API decides). */
    is_owner: z.boolean(),
    results: z.array(careerEntrySchema),
})

export type CareerList = z.infer<typeof careerListSchema>

// ── Org verification queue ────────────────────────────────────

/**
 * Who is claiming the stint. `role` matters to a reviewer: the same title means
 * very different things for a player, a coach and a scout.
 */
export const careerClaimantSchema = z.object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string().nullable(),
    profile_photo: z.string().nullable(),
    headline: z.string().nullable(),
    role: z.string(),
})

export type CareerClaimant = z.infer<typeof careerClaimantSchema>

/**
 * One row of an org's review queue. Deliberately NOT a CareerEntry: the
 * reviewer already knows which org they are, so the nested organization is
 * dropped and the claimant takes its place.
 */
export const careerVerificationRequestSchema = z.object({
    id: z.string(),
    user: careerClaimantSchema,

    title: z.string(),
    sport: careerSportSchema,
    positions: z.array(careerPositionSchema),

    entry_type: z.enum(CAREER_ENTRY_TYPES),
    squad_level: z.union([z.enum(CAREER_SQUAD_LEVELS), z.literal("")]),
    age_group: z.string(),

    start_date: z.string(),
    end_date: z.string().nullable(),
    is_current: z.boolean(),

    description: z.string(),
    verification_status: z.enum(CAREER_VERIFICATION_STATUSES),
    created_at: z.string(),
})

export type CareerVerificationRequest = z.infer<
    typeof careerVerificationRequestSchema
>

/** Which half of the org's review screen a row belongs to. */
export const CAREER_REVIEW_TABS = ["pending", "decided"] as const

export type CareerReviewTab = (typeof CAREER_REVIEW_TABS)[number]

export const careerVerificationRequestListSchema = z.object({
    /** Total matching rows, not the page length — drives the tab badge. */
    count: z.number(),
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
    status: z.enum(CAREER_REVIEW_TABS),
    results: z.array(careerVerificationRequestSchema),
})

export type CareerVerificationRequestList = z.infer<
    typeof careerVerificationRequestListSchema
>

// ── Form schema ───────────────────────────────────────────────

/** `<input type="date">` gives `YYYY-MM-DD`, which also sorts lexicographically. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isoDate = z
    .string()
    .regex(ISO_DATE, "Enter a valid date")

/**
 * The add/edit form.
 *
 * Empty strings rather than `undefined` for the optional text fields, so
 * react-hook-form has a stable controlled value for every input. `toCareerEntry
 * Payload` in the api module is what turns this into the request body.
 *
 * The three cross-field rules match CareerEntryService exactly:
 *   - an organization OR a typed club name
 *   - `is_current` and `end_date` are mutually exclusive
 *   - `end_date` cannot precede `start_date`
 */
export const careerEntryFormSchema = z
    .object({
        /** A Goatza org id, or "" when the player typed a name instead. */
        organization: z.string(),
        organization_name: z
            .string()
            .max(
                MAX_CAREER_ORGANIZATION_NAME_LENGTH,
                `Keep the club name under ${MAX_CAREER_ORGANIZATION_NAME_LENGTH} characters`
            ),

        sport: z.string().min(1, "Pick a sport"),

        title: z
            .string()
            .trim()
            .min(1, "Add your role, e.g. Player or Head Coach")
            .max(
                MAX_CAREER_TITLE_LENGTH,
                `Keep the title under ${MAX_CAREER_TITLE_LENGTH} characters`
            ),

        entry_type: z.enum(CAREER_ENTRY_TYPES),
        squad_level: z.union([z.enum(CAREER_SQUAD_LEVELS), z.literal("")]),
        age_group: z
            .string()
            .max(
                MAX_CAREER_AGE_GROUP_LENGTH,
                `Keep the age group under ${MAX_CAREER_AGE_GROUP_LENGTH} characters`
            ),

        positions: z.array(z.string()),

        // Two messages, because an empty date and a malformed one are
        // different mistakes — "Enter a valid date" on a field the user simply
        // hasn't filled in reads as though something they typed was wrong.
        start_date: z
            .string()
            .min(1, "Add a start date")
            .regex(ISO_DATE, "Enter a valid date"),
        /** "" means open-ended. */
        end_date: z.union([isoDate, z.literal("")]),
        is_current: z.boolean(),

        description: z.string(),
    })
    .superRefine((values, ctx) => {
        if (!values.organization && !values.organization_name.trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["organization_name"],
                message: "Pick an organization, or type the club or school name",
            })
        }

        if (values.is_current && values.end_date) {
            ctx.addIssue({
                code: "custom",
                path: ["end_date"],
                message: "Leave the end date empty while this is your current role",
            })
        }

        if (
            !values.is_current &&
            values.end_date &&
            values.end_date < values.start_date
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["end_date"],
                message: "The end date cannot be before the start date",
            })
        }
    })

export type CareerEntryFormValues = z.infer<typeof careerEntryFormSchema>

/** A blank form — also the shape `reset()` takes when adding a new entry. */
export const emptyCareerEntryForm = (): CareerEntryFormValues => ({
    organization: "",
    organization_name: "",
    sport: "",
    title: "",
    entry_type: DEFAULT_CAREER_ENTRY_TYPE,
    squad_level: "",
    age_group: "",
    positions: [],
    start_date: "",
    end_date: "",
    is_current: false,
    description: "",
})

/** Fill the form from an existing entry, for the edit flow. */
export const careerEntryToForm = (
    entry: CareerEntry
): CareerEntryFormValues => ({
    organization: entry.organization?.id ?? "",
    organization_name: entry.organization_name,
    sport: entry.sport.id,
    title: entry.title,
    entry_type: entry.entry_type,
    squad_level: entry.squad_level,
    age_group: entry.age_group,
    positions: entry.positions.map((position) => position.id),
    start_date: entry.start_date,
    end_date: entry.end_date ?? "",
    is_current: entry.is_current,
    description: entry.description,
})
