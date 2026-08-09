/**
 * Achievements — types + response schemas.
 *
 * The response schemas mirror `achievements/serializers/achievement_serializers.py`.
 * They guard the SHAPE of what the API returns (so a backend change surfaces
 * here, loudly, instead of as `undefined` deep inside a component) — they are
 * not a second copy of the server's business rules.
 *
 * The FORM schema at the bottom is different in kind: it re-states the server's
 * rules on purpose, so the user is told about a future date before a round trip.
 * The server still enforces all of it — this only moves the message earlier.
 */

import { z } from "zod"

import { todayForInput } from "./utils/achievementDates"

// ── Enums (mirror the model's TextChoices) ────────────────────

export const ACHIEVEMENT_TYPES = [
    "team_trophy",
    "individual_award",
    "record",
    "milestone",
    "certification",
    "other",
] as const

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number]

export const DEFAULT_ACHIEVEMENT_TYPE: AchievementType = "individual_award"

export const ACHIEVEMENT_LEVELS = [
    "school",
    "district",
    "state",
    "national",
    "international",
    "club_local",
] as const

export type AchievementLevel = (typeof ACHIEVEMENT_LEVELS)[number]

/** The same four states careers uses, with the same meanings. */
export const ACHIEVEMENT_VERIFICATION_STATUSES = [
    "self_reported",
    "pending",
    "verified",
    "rejected",
] as const

export type AchievementVerificationStatus =
    (typeof ACHIEVEMENT_VERIFICATION_STATUSES)[number]

/** Server rule: AchievementVerificationService.MAX_REASON_LENGTH. */
export const MAX_REJECT_REASON_LENGTH = 200

/**
 * Server rule: AchievementService.MAX_ACHIEVEMENTS. Mirrored here so the Add
 * button can go quiet at the cap instead of letting the user fill in a whole
 * form the server was always going to refuse.
 */
export const MAX_ACHIEVEMENTS = 20

/**
 * Server rule: AchievementService.MAX_PINNED. The form uses it to explain the
 * pin toggle before the server refuses it.
 */
export const MAX_PINNED_ACHIEVEMENTS = 3

/**
 * How many achievements the profile shows before "Show more". Three, the same
 * as CAREER_PAGE_SIZE — the two sections sit one under the other, and a shelf
 * that keeps showing a fourth card where the timeline above it already stopped
 * reads as one of them being broken.
 */
export const ACHIEVEMENT_PAGE_SIZE = 3

/** Server rule: the `title` column width. */
export const MAX_ACHIEVEMENT_TITLE_LENGTH = 150

/** Server rule: the `awarded_by_name` column width. */
export const MAX_ACHIEVEMENT_ISSUER_NAME_LENGTH = 150

/** Server rule: the `event_name` column width. */
export const MAX_ACHIEVEMENT_EVENT_NAME_LENGTH = 150

/**
 * Server rule: the `reference_link` column is URLField's default 200. The
 * service validates against it and answers 400, so catching it here just moves
 * the message earlier.
 */
export const MAX_ACHIEVEMENT_REFERENCE_LINK_LENGTH = 200

// ── Nested summaries ──────────────────────────────────────────

/**
 * The issuing org, when the award credits one on Goatza. Shape of
 * `OrganizationMiniSerializer` — the same summary the rest of the app renders
 * an org with.
 *
 * `null` for a free-text issuer (a federation that isn't on Goatza), for an
 * award with no issuer at all, AND for one whose org has since been deleted.
 * `awarded_by_name` on the achievement survives all three, so ALWAYS print the
 * name from there, never from here.
 */
export const achievementOrganizationSchema = z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    type: z.string(),
    logo: z.string(),
    headline: z.string(),
    is_verified: z.boolean(),
})

export type AchievementOrganization = z.infer<
    typeof achievementOrganizationSchema
>

export const achievementSportSchema = z.object({
    id: z.string(),
    name: z.string(),
    icon_name: z.string(),
    icon_url: z.string(),
})

export type AchievementSport = z.infer<typeof achievementSportSchema>

/**
 * The stint the award was won during. Just enough to caption the link — the
 * full entry is one tap away in the career section that already renders it.
 */
export const achievementCareerEntrySchema = z.object({
    id: z.string(),
    title: z.string(),
    organization_name: z.string(),
})

export type AchievementCareerEntry = z.infer<
    typeof achievementCareerEntrySchema
>

// ── Achievement ───────────────────────────────────────────────

export const achievementSchema = z.object({
    id: z.string(),

    title: z.string(),
    achievement_type: z.enum(ACHIEVEMENT_TYPES),
    sport: achievementSportSchema,

    description: z.string(),
    event_name: z.string(),
    /** Blank string when the owner didn't say. */
    level: z.union([z.enum(ACHIEVEMENT_LEVELS), z.literal("")]),

    awarded_by: achievementOrganizationSchema.nullable(),
    /**
     * Synced from the org when linked, free text otherwise — and legitimately
     * empty, unlike career's, because plenty of awards have no issuer at all.
     */
    awarded_by_name: z.string(),

    career_entry: achievementCareerEntrySchema.nullable(),

    /** ISO date, `YYYY-MM-DD`. A moment, not a range. */
    achieved_date: z.string(),

    image: z.string(),
    image_public_id: z.string(),
    reference_link: z.string(),

    is_pinned: z.boolean(),

    verification_status: z.enum(ACHIEVEMENT_VERIFICATION_STATUSES),
    verified_at: z.string().nullable(),

    created_at: z.string(),
})

export type Achievement = z.infer<typeof achievementSchema>

// ── List response ─────────────────────────────────────────────

export const achievementListSchema = z.object({
    count: z.number(),
    /** True when the requesting actor owns this shelf (the API decides). */
    is_owner: z.boolean(),
    results: z.array(achievementSchema),
})

export type AchievementList = z.infer<typeof achievementListSchema>

// ── Org verification queue (Stage 6 reads these) ──────────────

/**
 * Who is claiming the award. `role` matters to a reviewer: the same trophy
 * means very different things for a player, a coach and a scout.
 */
export const achievementClaimantSchema = z.object({
    id: z.string(),
    username: z.string().nullable(),
    name: z.string().nullable(),
    profile_photo: z.string().nullable(),
    headline: z.string().nullable(),
    role: z.string(),
})

export type AchievementClaimant = z.infer<typeof achievementClaimantSchema>

/**
 * One row of an org's review queue. Deliberately NOT an Achievement: the
 * reviewer already knows which org they are, so the nested issuer is dropped
 * and the claimant takes its place. `is_pinned` is absent too — where the owner
 * puts this on their own profile is not a reviewer's business.
 */
export const achievementVerificationRequestSchema = z.object({
    id: z.string(),
    user: achievementClaimantSchema,

    title: z.string(),
    achievement_type: z.enum(ACHIEVEMENT_TYPES),
    sport: achievementSportSchema,

    description: z.string(),
    event_name: z.string(),
    level: z.union([z.enum(ACHIEVEMENT_LEVELS), z.literal("")]),

    achieved_date: z.string(),
    image: z.string(),
    reference_link: z.string(),

    verification_status: z.enum(ACHIEVEMENT_VERIFICATION_STATUSES),
    created_at: z.string(),
})

export type AchievementVerificationRequest = z.infer<
    typeof achievementVerificationRequestSchema
>

/** Which half of the org's review screen a row belongs to. */
export const ACHIEVEMENT_REVIEW_TABS = ["pending", "decided"] as const

export type AchievementReviewTab = (typeof ACHIEVEMENT_REVIEW_TABS)[number]

export const achievementVerificationRequestListSchema = z.object({
    /** Total matching rows, not the page length — drives the tab badge. */
    count: z.number(),
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
    status: z.enum(ACHIEVEMENT_REVIEW_TABS),
    results: z.array(achievementVerificationRequestSchema),
})

export type AchievementVerificationRequestList = z.infer<
    typeof achievementVerificationRequestListSchema
>

// ── Form schema ───────────────────────────────────────────────

/** `<input type="date">` gives `YYYY-MM-DD`, which also sorts lexicographically. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The add/edit form.
 *
 * Empty strings rather than `undefined` for the optional text fields, so
 * react-hook-form has a stable controlled value for every input.
 * `toCreateAchievementPayload` in the api module is what turns this into the
 * request body.
 *
 * The cross-field rules match AchievementService:
 *   - `achieved_date` is required and cannot be in the future
 *   - a linked career entry must be for the chosen sport
 * Note what is deliberately NOT here: careers demands an org OR a typed name,
 * and achievements do not — an award with no issuer at all is ordinary.
 */
export const achievementFormSchema = z
    .object({
        title: z
            .string()
            .trim()
            .min(1, "Add what you won, e.g. Golden Boot")
            .max(
                MAX_ACHIEVEMENT_TITLE_LENGTH,
                `Keep the title under ${MAX_ACHIEVEMENT_TITLE_LENGTH} characters`
            ),

        achievement_type: z.enum(ACHIEVEMENT_TYPES),

        sport: z.string().min(1, "Pick a sport"),

        // Two messages, because an empty date and a malformed one are different
        // mistakes — "Enter a valid date" on a field the user simply hasn't
        // filled in reads as though something they typed was wrong.
        achieved_date: z
            .string()
            .min(1, "Add the date you won this")
            .regex(ISO_DATE, "Enter a valid date"),

        level: z.union([z.enum(ACHIEVEMENT_LEVELS), z.literal("")]),

        event_name: z
            .string()
            .max(
                MAX_ACHIEVEMENT_EVENT_NAME_LENGTH,
                `Keep the event name under ${MAX_ACHIEVEMENT_EVENT_NAME_LENGTH} characters`
            ),

        /** A Goatza org id, or "" when the owner typed a name (or nothing). */
        awarded_by: z.string(),
        awarded_by_name: z
            .string()
            .max(
                MAX_ACHIEVEMENT_ISSUER_NAME_LENGTH,
                `Keep the issuer name under ${MAX_ACHIEVEMENT_ISSUER_NAME_LENGTH} characters`
            ),

        /** A career entry id, or "" for no link. */
        career_entry: z.string(),
        /**
         * The linked entry's sport, carried alongside the id purely so the
         * cross-field rule below can compare without reaching for the query
         * cache. "" whenever `career_entry` is "".
         */
        career_entry_sport: z.string(),

        image: z.string(),
        image_public_id: z.string(),

        reference_link: z
            .string()
            .max(
                MAX_ACHIEVEMENT_REFERENCE_LINK_LENGTH,
                `Keep the link under ${MAX_ACHIEVEMENT_REFERENCE_LINK_LENGTH} characters`
            ),

        is_pinned: z.boolean(),

        description: z.string(),
    })
    .superRefine((values, ctx) => {
        if (values.achieved_date && values.achieved_date > todayForInput()) {
            ctx.addIssue({
                code: "custom",
                path: ["achieved_date"],
                message: "You can't have won this in the future",
            })
        }

        // The server rejects a mismatch with a 400. Saying it here means the
        // owner is told which two things disagree while both are on screen.
        if (
            values.career_entry &&
            values.career_entry_sport &&
            values.career_entry_sport !== values.sport
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["career_entry"],
                message:
                    "That career entry is for a different sport — pick one that matches, or clear it",
            })
        }

        if (values.reference_link.trim()) {
            try {
                new URL(values.reference_link.trim())
            } catch {
                ctx.addIssue({
                    code: "custom",
                    path: ["reference_link"],
                    message: "Enter a full link, starting with https://",
                })
            }
        }
    })

export type AchievementFormValues = z.infer<typeof achievementFormSchema>

/** A blank form — also the shape `reset()` takes when adding a new award. */
export const emptyAchievementForm = (): AchievementFormValues => ({
    title: "",
    achievement_type: DEFAULT_ACHIEVEMENT_TYPE,
    sport: "",
    achieved_date: "",
    level: "",
    event_name: "",
    awarded_by: "",
    awarded_by_name: "",
    career_entry: "",
    career_entry_sport: "",
    image: "",
    image_public_id: "",
    reference_link: "",
    is_pinned: false,
    description: "",
})

/** Fill the form from an existing achievement, for the edit flow. */
export const achievementToForm = (
    achievement: Achievement
): AchievementFormValues => ({
    title: achievement.title,
    achievement_type: achievement.achievement_type,
    sport: achievement.sport.id,
    achieved_date: achievement.achieved_date,
    level: achievement.level,
    event_name: achievement.event_name,
    awarded_by: achievement.awarded_by?.id ?? "",
    awarded_by_name: achievement.awarded_by_name,
    career_entry: achievement.career_entry?.id ?? "",
    // The list response carries no sport on the nested entry, so this stays
    // empty until the owner picks a different one — at which point the picker
    // fills it in from the career list it is reading anyway.
    career_entry_sport: "",
    image: achievement.image,
    image_public_id: achievement.image_public_id,
    reference_link: achievement.reference_link,
    is_pinned: achievement.is_pinned,
    description: achievement.description,
})
