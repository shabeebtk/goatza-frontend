/**
 * React Query hooks for announcements, direct messages and the trial pass.
 *
 * THE POLLING RULE. Creating an announcement queues it; a cron drains the
 * outbox every few minutes. So after a send the delivery summary is
 * legitimately all-pending, and the list has to keep asking for a while to
 * show it landing. `useAnnouncements` polls ONLY while something is still
 * pending and ONLY for a bounded number of ticks — an indefinite poll on a
 * page an org leaves open is a request every few seconds for the rest of the
 * afternoon, for a number that changes twice.
 */

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
    createAnnouncementApi,
    deleteAnnouncementApi,
    fetchAnnouncementsApi,
    fetchRecipientsCountApi,
    fetchTrialPassApi,
    messageApplicantsApi,
    type AnnouncementAudience,
    type CreateAnnouncementPayload,
} from "../services/announcements.api"

export const announcementKeys = {
    all: ["recruitments", "announcements"] as const,
    list: (recruitmentId: string) =>
        [...announcementKeys.all, recruitmentId] as const,
    recipients: (
        recruitmentId: string,
        audience: AnnouncementAudience,
        session: string | null,
    ) => [...announcementKeys.all, recruitmentId, "count", audience, session] as const,
    pass: (applicationId: string) =>
        ["recruitments", "pass", applicationId] as const,
}

/** How long a just-sent announcement is watched before the UI stops asking. */
const POLL_INTERVAL_MS = 8000
const WATCH_WINDOW_MS = POLL_INTERVAL_MS * 8

export const useAnnouncements = (
    recruitmentId: string,
    enabled = true,
) => {
    // A DEADLINE, not a countdown. Polling stops on whichever comes first:
    // nothing left pending, or the window expiring. Expressed as one derived
    // `refetchInterval` rather than an effect that resets state — an effect
    // that calls setState during render cascades, and React Query is already
    // the scheduler here.
    const [watchUntil, setWatchUntil] = useState(0)

    const query = useQuery({
        queryKey: announcementKeys.list(recruitmentId),
        queryFn: () => fetchAnnouncementsApi(recruitmentId),
        enabled: enabled && !!recruitmentId,
        staleTime: 1000 * 30,
        refetchInterval: (q) => {
            const stillSending = (q.state.data?.results ?? []).some(
                (announcement) =>
                    (announcement.delivery_summary?.pending ?? 0) > 0,
            )
            if (!stillSending) return false
            return Date.now() < watchUntil ? POLL_INTERVAL_MS : false
        },
    })

    return {
        ...query,
        /** Watch the outbox drain for a bounded window. Call after a send. */
        watchDeliveries: () => setWatchUntil(Date.now() + WATCH_WINDOW_MS),
    }
}

export const useCreateAnnouncement = (recruitmentId: string) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (payload: CreateAnnouncementPayload) =>
            createAnnouncementApi(recruitmentId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: announcementKeys.list(recruitmentId),
            })
        },
    })
}

export const useDeleteAnnouncement = (recruitmentId: string) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (announcementId: string) =>
            deleteAnnouncementApi(announcementId),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: announcementKeys.list(recruitmentId),
            })
        },
    })
}

/**
 * The live recipient count behind the composer's send button.
 *
 * Debounced by the CALLER passing a settled audience/session — the query key
 * carries both, so React Query caches each combination and flipping back to a
 * previous one is instant rather than another round trip.
 */
export const useRecipientsCount = (
    recruitmentId: string,
    audience: AnnouncementAudience,
    session: string | null,
    enabled = true,
) =>
    useQuery({
        queryKey: announcementKeys.recipients(recruitmentId, audience, session),
        queryFn: () =>
            fetchRecipientsCountApi(recruitmentId, { audience, session }),
        enabled: enabled && !!recruitmentId,
        staleTime: 1000 * 30,
    })

export const useMessageApplicants = (recruitmentId: string) =>
    useMutation({
        mutationFn: (body: { applicationIds: string[]; body: string }) =>
            messageApplicantsApi(recruitmentId, body),
    })

export const useTrialPass = (applicationId: string | null) =>
    useQuery({
        queryKey: announcementKeys.pass(applicationId ?? ""),
        queryFn: () => fetchTrialPassApi(applicationId as string),
        enabled: !!applicationId,
        staleTime: 1000 * 60,
        // A pass that 404s or 409s is an answer, not a blip: the application
        // is not the caller's, or not confirmed. Retrying says the same thing
        // three more times.
        retry: false,
    })
