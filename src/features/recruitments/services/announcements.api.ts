/**
 * Announcements, direct messages and the trial pass.
 *
 * THE ONE THING TO UNDERSTAND ABOUT THIS API: creating an announcement or a
 * direct message QUEUES it. The server writes one delivery row per recipient
 * per channel and returns immediately; a cron drains them every few minutes.
 * So a freshly sent announcement legitimately reads as pending, and the UI has
 * to say "Sending… 12 of 142" rather than looking broken. Nothing here should
 * ever be described to the user as "sent" at the moment it returns.
 */

import api from "@/core/api/axios"

import type {
    ApplicationStatus,
    StatusChangeSkip,
    TrialSession,
} from "./recruitments.api"

// ── Announcements ─────────────────────────────────────────────

export type AnnouncementAudience = "all_applicants" | "confirmed" | "selected"

/** Every state a delivery can be in, zero-filled by the server. */
export type DeliverySummary = {
    sent: number
    pending: number
    failed: number
    skipped: number
}

export type Announcement = {
    id: string
    title: string
    body: string
    audience: AnnouncementAudience
    /** The date it narrows to, venue already resolved. Null for the whole trial. */
    session: TrialSession | null
    recipients_count: number
    posted_by: { id: string; name: string } | null
    /**
     * OWNER ONLY. Null for a player — how many people got the message is the
     * org's business, not the audience's.
     */
    delivery_summary: DeliverySummary | null
    created_at: string
}

export type AnnouncementsResponse = {
    count: number
    limit: number
    offset: number
    results: Announcement[]
}

export const fetchAnnouncementsApi = async (
    recruitmentId: string,
    params: { limit?: number; offset?: number } = {},
): Promise<AnnouncementsResponse> => {
    const res = await api.get(`/recruitments/${recruitmentId}/announcements`, {
        params,
    })
    return res.data.data
}

export type CreateAnnouncementPayload = {
    title: string
    body: string
    audience: AnnouncementAudience
    /** A TrialSession id. Only meaningful on a choose_one trial. */
    session?: string | null
}

export const createAnnouncementApi = async (
    recruitmentId: string,
    payload: CreateAnnouncementPayload,
): Promise<Announcement> => {
    const res = await api.post(
        `/recruitments/${recruitmentId}/announcements`,
        payload,
    )
    return res.data.data
}

export const deleteAnnouncementApi = async (
    announcementId: string,
): Promise<{ announcement_id: string; is_deleted: boolean; recalled: boolean }> => {
    const res = await api.delete(`/recruitments/announcements/${announcementId}`)
    return res.data.data
}

/**
 * How many people an audience would reach, BEFORE sending. Resolved by the
 * same server-side function that writes the outbox, so the number shown is
 * the number that gets written.
 */
export const fetchRecipientsCountApi = async (
    recruitmentId: string,
    params: { audience: AnnouncementAudience; session?: string | null },
): Promise<number> => {
    const res = await api.get(
        `/recruitments/${recruitmentId}/announcements/recipients-count`,
        { params: { audience: params.audience, session: params.session || undefined } },
    )
    return res.data.data.count
}

// ── Message selected ──────────────────────────────────────────

export type MessageApplicantsResponse = {
    queued: number
    /**
     * Same shape the bulk status change returns, so one `summarizeSkips`
     * renders both. A blocked pair is NOT listed here — the org is never told
     * which recipients a block skipped, or the block leaks.
     */
    skipped: StatusChangeSkip[]
}

export const messageApplicantsApi = async (
    recruitmentId: string,
    body: { applicationIds: string[]; body: string },
): Promise<MessageApplicantsResponse> => {
    const res = await api.post(
        `/recruitments/${recruitmentId}/applications/message`,
        { application_ids: body.applicationIds, body: body.body },
    )
    return res.data.data
}

// ── The trial pass ────────────────────────────────────────────

export type TrialPassSessionInfo = {
    id: string
    title: string
    date: string
    start_time: string | null
    end_time: string | null
    is_cancelled: boolean
    venue_name: string
    venue_link: string
    city: string
    latitude: number | null
    longitude: number | null
}

export type TrialPass = {
    application_id: string
    status: ApplicationStatus
    organization: {
        id: string
        name: string
        username: string
        logo: string
        is_verified: boolean
    }
    recruitment: { id: string; title: string }
    player: { name: string; username: string; photo: string }
    age_group: {
        id: string
        title: string
        min_birth_year: number | null
        max_birth_year: number | null
        reporting_time: string | null
    } | null
    sessions: TrialPassSessionInfo[]
    bring: { id: string; title: string; is_mandatory: boolean }[]
    fee: {
        is_paid_trial: boolean
        amount: string | null
        currency: string
        note: string
        fee_paid: boolean
    }
    /**
     * The booking reference the player shows if an organiser asks to confirm
     * they registered. Minted on confirmation, so a pass always carries one —
     * the null is kept for an older cached payload that predates the rename.
     */
    pass_code: string | null
}

export const fetchTrialPassApi = async (
    applicationId: string,
): Promise<TrialPass> => {
    const res = await api.get(`/recruitments/applications/${applicationId}/pass`)
    return res.data.data
}
