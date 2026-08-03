/**
 * Achievements API (backend: /achievements/).
 *
 * Uses the shared axios instance, so every call already carries the JWT and the
 * active actor headers. Responses are unwrapped from the standard envelope
 * (`res.data.data`) and parsed through the feature schemas.
 *
 * ACTOR MATTERS on this feature more than most. The write endpoints split in
 * two and the server decides by header, not by argument:
 *   - create / update / delete                    → must be acting as the USER
 *   - verification-requests / verify / reject     → must be acting as the ORG,
 *     and as an OWNER or ADMIN member of it
 * Calling one while acting as the other is a 403, so the calling component is
 * responsible for being on the right side of the AccountSwitcher.
 *
 * NOTE ON PATHS: none of these end in a slash. In production the client talks
 * to /api/<path> and Vercel rewrites it; a trailing slash 308s to the
 * slash-less form, Django APPEND_SLASHes back with a path-only Location, and
 * the browser resolves that against the frontend origin — the /api prefix is
 * gone and the call lands on the Next.js 404 page.
 */

import { z } from "zod"

import api from "@/core/api/axios"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
    achievementListSchema,
    achievementSchema,
    achievementVerificationRequestListSchema,
    type Achievement,
    type AchievementFormValues,
    type AchievementLevel,
    type AchievementList,
    type AchievementReviewTab,
    type AchievementType,
    type AchievementVerificationRequestList,
} from "../types"

const BASE = "/achievements"

// ── Payloads ──────────────────────────────────────────────────

export type CreateAchievementPayload = {
    title: string
    achievement_type?: AchievementType
    sport: string
    description?: string
    event_name?: string
    level?: AchievementLevel | ""
    /** A Goatza org id, or null/omitted when there is no linked issuer. */
    awarded_by?: string | null
    awarded_by_name?: string
    /** One of the owner's own career entries, or null/omitted. */
    career_entry?: string | null
    /** ISO date, `YYYY-MM-DD`. */
    achieved_date: string
    image?: string
    image_public_id?: string
    reference_link?: string
    is_pinned?: boolean
}

/**
 * PATCH body. Every field is optional and the server distinguishes "absent"
 * from "sent as null":
 *   - omit `awarded_by`        → leave the link alone
 *   - send an id               → link (and the award goes back to `pending`)
 *   - send `null`              → unlink (the award becomes `self_reported`)
 * `undefined` keys are dropped by JSON serialization, which is exactly the
 * "absent" case, so a partial object here does the right thing.
 */
export type UpdateAchievementPayload = Partial<
    Omit<CreateAchievementPayload, "sport">
> & {
    sport?: string
}

export type RejectAchievementPayload = {
    reason?: string
}

// ── Form → payload ────────────────────────────────────────────

/**
 * Turn form values into a create body.
 *
 * Empty strings become the absent/null the API expects: `awarded_by: ""` is "no
 * issuer linked", `career_entry: ""` is "not tied to a stint". Unlike careers,
 * an empty `awarded_by_name` alongside an empty `awarded_by` is a perfectly
 * good answer and is sent as-is.
 */
export const toCreateAchievementPayload = (
    values: AchievementFormValues
): CreateAchievementPayload => ({
    title: values.title.trim(),
    achievement_type: values.achievement_type,
    sport: values.sport,
    description: values.description.trim(),
    event_name: values.event_name.trim(),
    level: values.level,
    awarded_by: values.awarded_by || null,
    awarded_by_name: values.awarded_by_name.trim(),
    career_entry: values.career_entry || null,
    achieved_date: values.achieved_date,
    image: values.image.trim(),
    image_public_id: values.image_public_id.trim(),
    reference_link: values.reference_link.trim(),
    is_pinned: values.is_pinned,
})

/**
 * Turn form values into a PATCH body — the WHOLE form, not a diff.
 *
 * Safe by design: the server compares each field against what it already has
 * and only treats genuinely-changed MATERIAL fields as an edit, so resending
 * unchanged values never knocks a verified award back to pending. That means
 * the edit form does not have to track dirty state to avoid losing a
 * verification.
 */
export const toUpdateAchievementPayload = (
    values: AchievementFormValues
): UpdateAchievementPayload => toCreateAchievementPayload(values)

// ── Calls: the owner's own shelf ──────────────────────────────

/**
 * One user's achievements, in profile order (pinned first, then most recently
 * achieved). Readable by any signed-in actor — an achievement shelf is the part
 * of a profile recruiters are meant to read.
 */
export const fetchUserAchievementsApi = async (
    userId: string
): Promise<AchievementList> => {
    const res = await api.get(`${BASE}/users/${encodeURIComponent(userId)}`)
    return achievementListSchema.parse(res.data.data)
}

/** One achievement — what a shared link or a notification deep link opens. */
export const fetchAchievementApi = async (
    achievementId: string
): Promise<Achievement> => {
    const res = await api.get(`${BASE}/${achievementId}`)
    return achievementSchema.parse(res.data.data)
}

export const createAchievementApi = async (
    payload: CreateAchievementPayload
): Promise<Achievement> => {
    const res = await api.post(`${BASE}/create`, payload)
    return achievementSchema.parse(res.data.data)
}

export const updateAchievementApi = async (
    achievementId: string,
    payload: UpdateAchievementPayload
): Promise<Achievement> => {
    const res = await api.patch(`${BASE}/${achievementId}`, payload)
    return achievementSchema.parse(res.data.data)
}

/** Hard delete — structured profile data, so there is nothing to restore. */
export const deleteAchievementApi = async (
    achievementId: string
): Promise<void> => {
    await api.delete(`${BASE}/${achievementId}`)
}

// ── Calls: the org's review queue (Stage 6) ───────────────────

/**
 * Achievements waiting on the ACTING organization's decision. Requires an org
 * actor whose membership role is OWNER or ADMIN — a COACH/STAFF member gets a
 * 403.
 */
export const fetchAchievementVerificationRequestsApi = async (params: {
    status: AchievementReviewTab
    limit?: number
    offset?: number
}): Promise<AchievementVerificationRequestList> => {
    const res = await api.get(`${BASE}/verification-requests`, {
        params: {
            status: params.status,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.offset ? { offset: params.offset } : {}),
        },
    })
    return achievementVerificationRequestListSchema.parse(res.data.data)
}

export const verifyAchievementApi = async (achievementId: string) => {
    const res = await api.post(`${BASE}/${achievementId}/verify`, {})
    return res.data.data
}

/**
 * Decline a claim. The achievement is not deleted — it stays on the owner's
 * profile marked `rejected`, and editing it puts it back in this queue.
 * `reason` is a short note that reaches the owner on the notification.
 */
export const rejectAchievementApi = async (
    achievementId: string,
    payload: RejectAchievementPayload = {}
) => {
    const res = await api.post(`${BASE}/${achievementId}/reject`, payload)
    return res.data.data
}

// ── Error copy ────────────────────────────────────────────────

/**
 * The backend already writes human error messages ("You can pin up to 3
 * achievements. Unpin one to pin this.", "That career entry is a Basketball
 * stint, so it cannot hold a Football achievement."), so this passes them
 * through and only supplies an achievement-flavoured fallback.
 *
 * Two things are deliberately NEVER shown to a user:
 *   - axios's own "Request failed with status code 404" (getApiErrorMessage
 *     already refuses to return it — a bare 404 means our routing is wrong,
 *     which is not something the user can act on)
 *   - a Zod parse failure, whose message is a multi-line JSON dump. A response
 *     that doesn't match the schema is a wiring bug; the user gets the fallback
 *     and we keep the detail in the console.
 */
export const getAchievementErrorMessage = (
    err: unknown,
    fallback = "Something went wrong with your achievements. Please try again."
): string => {
    if (err instanceof z.ZodError) return fallback
    return getApiErrorMessage(err, fallback)
}
