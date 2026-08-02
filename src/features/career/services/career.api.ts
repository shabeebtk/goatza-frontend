/**
 * Career API (backend: /careers/).
 *
 * Uses the shared axios instance, so every call already carries the JWT and the
 * active actor headers. Responses are unwrapped from the standard envelope
 * (`res.data.data`) and parsed through the feature schemas.
 *
 * ACTOR MATTERS on this feature more than most. The write endpoints split in
 * two and the server decides by header, not by argument:
 *   - create / update / delete / from-application → must be acting as the USER
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
    careerEntrySchema,
    careerListSchema,
    careerVerificationRequestListSchema,
    type CareerEntry,
    type CareerEntryFormValues,
    type CareerEntryType,
    type CareerList,
    type CareerReviewTab,
    type CareerSquadLevel,
    type CareerVerificationRequestList,
} from "../types"

const BASE = "/careers"

// ── Payloads ──────────────────────────────────────────────────

export type CreateCareerEntryPayload = {
    /** A Goatza org id, or null/omitted for a free-text club. */
    organization?: string | null
    organization_name?: string
    sport: string
    title: string
    entry_type?: CareerEntryType
    squad_level?: CareerSquadLevel | ""
    age_group?: string
    positions?: string[]
    /** ISO date, `YYYY-MM-DD`. */
    start_date: string
    end_date?: string | null
    is_current?: boolean
    description?: string
}

/**
 * PATCH body. Every field is optional and the server distinguishes "absent"
 * from "sent as null":
 *   - omit `organization`      → leave the link alone
 *   - send an id               → link (and the entry goes back to `pending`)
 *   - send `null`              → unlink (the entry becomes `self_reported`)
 * `undefined` keys are dropped by JSON serialization, which is exactly the
 * "absent" case, so a partial object here does the right thing.
 */
export type UpdateCareerEntryPayload = Partial<
    Omit<CreateCareerEntryPayload, "sport">
> & {
    sport?: string
}

/** All three are optional — the rest is prefilled from the recruitment. */
export type CareerFromApplicationPayload = {
    title?: string
    start_date?: string
    description?: string
}

export type RejectCareerEntryPayload = {
    reason?: string
}

// ── Form → payload ────────────────────────────────────────────

/**
 * Turn form values into a create body.
 *
 * Empty strings become the absent/null the API expects: `organization: ""` is
 * "no club linked", `end_date: ""` is "open-ended". `is_current` wins over any
 * end date server-side, but it is cleared here too so the request says one
 * thing rather than two.
 */
export const toCreateCareerEntryPayload = (
    values: CareerEntryFormValues
): CreateCareerEntryPayload => ({
    organization: values.organization || null,
    organization_name: values.organization_name.trim(),
    sport: values.sport,
    title: values.title.trim(),
    entry_type: values.entry_type,
    squad_level: values.squad_level,
    age_group: values.age_group.trim(),
    positions: values.positions,
    start_date: values.start_date,
    end_date: values.is_current ? null : values.end_date || null,
    is_current: values.is_current,
    description: values.description.trim(),
})

/**
 * Turn form values into a PATCH body — the WHOLE form, not a diff.
 *
 * Safe by design: the server compares each field against what it already has
 * and only treats genuinely-changed material fields as an edit, so resending
 * unchanged values never knocks a verified entry back to pending. That means
 * the edit form does not have to track dirty state to avoid losing a
 * verification.
 */
export const toUpdateCareerEntryPayload = (
    values: CareerEntryFormValues
): UpdateCareerEntryPayload => toCreateCareerEntryPayload(values)

// ── Calls: the owner's own history ────────────────────────────

/**
 * One user's career history, newest-relevant first (current entries, then by
 * most recent end date). Readable by any signed-in actor — a career is the part
 * of a profile recruiters are meant to read.
 */
export const fetchUserCareerApi = async (
    userId: string
): Promise<CareerList> => {
    const res = await api.get(`${BASE}/users/${encodeURIComponent(userId)}`)
    return careerListSchema.parse(res.data.data)
}

export const createCareerEntryApi = async (
    payload: CreateCareerEntryPayload
): Promise<CareerEntry> => {
    const res = await api.post(`${BASE}/create`, payload)
    return careerEntrySchema.parse(res.data.data)
}

export const updateCareerEntryApi = async (
    entryId: string,
    payload: UpdateCareerEntryPayload
): Promise<CareerEntry> => {
    const res = await api.patch(`${BASE}/${entryId}`, payload)
    return careerEntrySchema.parse(res.data.data)
}

/** Hard delete — structured profile data, so there is nothing to restore. */
export const deleteCareerEntryApi = async (entryId: string): Promise<void> => {
    await api.delete(`${BASE}/${entryId}`)
}

// ── Calls: recruitment integration ────────────────────────────

/**
 * Turn a selection into a career entry, prefilled from the recruitment.
 *
 * Idempotent: the server answers 201 the first time and 200 with the existing
 * entry after that, so this can be fired straight off the "add to career"
 * prompt without tracking whether it already ran. `created` reflects which
 * happened — use it to pick the toast, not to decide whether to retry.
 */
export const addCareerFromApplicationApi = async (
    applicationId: string,
    payload: CareerFromApplicationPayload = {}
): Promise<{ entry: CareerEntry; created: boolean }> => {
    const res = await api.post(
        `${BASE}/from-application/${encodeURIComponent(applicationId)}`,
        payload
    )
    return {
        entry: careerEntrySchema.parse(res.data.data),
        created: res.status === 201,
    }
}

// ── Calls: the org's review queue ─────────────────────────────

/**
 * Entries waiting on the ACTING organization's decision. Requires an org actor
 * whose membership role is OWNER or ADMIN — a COACH/STAFF member gets a 403.
 */
export const fetchVerificationRequestsApi = async (params: {
    status: CareerReviewTab
    limit?: number
    offset?: number
}): Promise<CareerVerificationRequestList> => {
    const res = await api.get(`${BASE}/verification-requests`, {
        params: {
            status: params.status,
            ...(params.limit !== undefined ? { limit: params.limit } : {}),
            ...(params.offset ? { offset: params.offset } : {}),
        },
    })
    return careerVerificationRequestListSchema.parse(res.data.data)
}

export const verifyCareerEntryApi = async (
    entryId: string
): Promise<CareerEntry> => {
    const res = await api.post(`${BASE}/${entryId}/verify`, {})
    return careerEntrySchema.parse(res.data.data)
}

/**
 * Decline a claim. The entry is not deleted — it stays on the player's profile
 * marked `rejected`, and editing it puts it back in this queue. `reason` is a
 * short note that reaches the player on the notification.
 */
export const rejectCareerEntryApi = async (
    entryId: string,
    payload: RejectCareerEntryPayload = {}
): Promise<CareerEntry> => {
    const res = await api.post(`${BASE}/${entryId}/reject`, payload)
    return careerEntrySchema.parse(res.data.data)
}

// ── Error copy ────────────────────────────────────────────────

/**
 * The backend already writes human error messages ("You can only add this to
 * your career once the organization has selected you.", "Goalkeeper is not a
 * Basketball position."), so this passes them through and only supplies a
 * career-flavoured fallback.
 *
 * Two things are deliberately NEVER shown to a user:
 *   - axios's own "Request failed with status code 404" (getApiErrorMessage
 *     already refuses to return it — a bare 404 means our routing is wrong,
 *     which is not something the user can act on)
 *   - a Zod parse failure, whose message is a multi-line JSON dump. A response
 *     that doesn't match the schema is a wiring bug; the user gets the fallback
 *     and we keep the detail in the console.
 */
export const getCareerErrorMessage = (
    err: unknown,
    fallback = "Something went wrong with your career history. Please try again."
): string => {
    if (err instanceof z.ZodError) return fallback
    return getApiErrorMessage(err, fallback)
}
