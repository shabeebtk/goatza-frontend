"use client"

/**
 * The ONE ws/notifications/ connection, app-wide. Mounted by AppShell and by
 * OrgShell (one replaces the other, never both), it opens the socket for the
 * ACTIVE actor — the same URL, actor params and token the conversations list
 * always used — reconnects when the actor changes, and hands every parsed
 * message to the realtime bus. Renders nothing.
 *
 * Listeners subscribe to the bus, never to a socket of their own:
 * conversation_updated (the conversations list), media_job_updated
 * (sourceUpload.ts), publication_updated (the upload queue).
 */

import { useCallback } from "react"

import { REALTIME_OPEN, realtimeBus, type RealtimePayload } from "@/core/ws/realtimeBus"
import { useWebSocket } from "@/core/ws/useWebSocket"
import { useAuthStore } from "@/store/auth.store"

/** Personal actor: no params. Org actor: the org, so the server joins its group. */
export function buildNotificationsWsUrl(
    actorType: "user" | "organization",
    actorId: string | null
): string {
    const base = process.env.NEXT_PUBLIC_WS_URL
    let url = `${base}/ws/notifications/`

    if (actorType === "organization" && actorId) {
        url += `?actor_type=organization&org_id=${actorId}`
    }

    return url
}

export default function NotificationsSocket() {
    const user = useAuthStore((s) => s.user)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)

    const onMessage = useCallback((data: unknown) => {
        if (data && typeof data === "object") realtimeBus.emit(data as RealtimePayload)
    }, [])

    const onOpen = useCallback(() => {
        realtimeBus.emit({ notification_type: REALTIME_OPEN })
    }, [])

    useWebSocket({
        // Only while signed in. A change of actor is a change of URL, which
        // useWebSocket answers by closing the old socket and opening this one.
        url: user ? buildNotificationsWsUrl(actorType, actorId) : null,
        onMessage,
        onOpen,
    })

    return null
}
