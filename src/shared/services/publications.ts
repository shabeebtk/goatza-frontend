/**
 * Posts and highlights the SERVER is holding while their media converts.
 *
 * A create that names a media job still converting answers 202
 * `{pending_publication}` instead of creating anything; the server publishes
 * the post itself when the job is ready — whether or not the app is still
 * open — and says so on the notifications socket (`publication_updated`).
 * This is the client side of that: the payload, and the three endpoints the
 * upload queue uses to restore, cancel and dismiss them.
 */

import api, { withActor, type RequestActor } from "@/core/api/axios"

export type PublicationTarget = "post" | "highlight"

export type PublicationStatus = "processing" | "published" | "failed" | "cancelled"

/** One shape for the 202, the list and the socket event. */
export type PendingPublication = {
    id: string
    target: PublicationTarget
    status: PublicationStatus
    error_code: string | null
    /** The human sentence when it failed. */
    error_message: string | null
    /** The post / highlight id once published. */
    result_id: string | null
    created_at: string
    published_at: string | null
    preview: {
        media_type: "image" | "video" | null
        thumbnail_url: string | null
        /** The caption (or highlight title), ≤ 80 characters. */
        content: string
    }
    jobs: { id: string; status: string }[]
}

/**
 * The actor's own, not dismissed, from the last week, newest first, at most
 * 20. `actor` defaults to the active one (axios.ts, RequestActor).
 */
export async function fetchPublications(
    statuses: PublicationStatus[] = ["processing", "failed"],
    actor?: RequestActor
): Promise<PendingPublication[]> {
    const res = await api.get("/media/publications", {
        params: { status: statuses.join(",") },
        ...withActor(actor),
    })
    return (res.data?.data?.publications ?? []) as PendingPublication[]
}

/** Only while processing; 400 `publication_not_processing` after that. */
export async function cancelPublication(
    id: string,
    actor?: RequestActor
): Promise<PendingPublication> {
    const res = await api.post(`/media/publications/${id}/cancel`, undefined, withActor(actor))
    return res.data.data.publication as PendingPublication
}

/** A FAILED one stops coming back from {@link fetchPublications}. */
export async function dismissPublication(
    id: string,
    actor?: RequestActor
): Promise<PendingPublication> {
    const res = await api.post(`/media/publications/${id}/dismiss`, undefined, withActor(actor))
    return res.data.data.publication as PendingPublication
}
