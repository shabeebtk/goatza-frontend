import { useCallback, useEffect } from "react"
import { useWebSocket } from "@/core/ws/useWebSocket"
import { useAuthStore } from "@/store/auth.store"
import { useQueryClient } from "@tanstack/react-query"
import { invalidateConversationsExceptMessages } from "./useConversationQueries"

function buildNotificationsWsUrl(
    actorType: "user" | "organization",
    actorId: string | null
): string | null {
    const base = process.env.NEXT_PUBLIC_WS_URL
    let url = `${base}/ws/notifications/`
    
    if (actorType === "organization" && actorId) {
        url += `?actor_type=organization&org_id=${actorId}`
    }
    
    return url
}

export function useConversationsSocket() {
    const user = useAuthStore((s) => s.user)
    const token = useAuthStore((s) => s.accessToken)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)
    const queryClient = useQueryClient()

    const handleMessage = useCallback((data: unknown) => {
        const payload = data as { notification_type?: string, conversation_id?: string }
        if (payload.notification_type === "conversation_updated") {
            // Invalidate the conversations list so it fetches the new list.
            // NOT the message history: that key is prefix-matched by
            // conversationKeys.all(), and refetching it replaces `data.pages`
            // wholesale — which deletes any optimistic bubble still uploading.
            // A long video upload is wide open to this; the open chat is kept
            // current by its own websocket anyway.
            invalidateConversationsExceptMessages(queryClient)
        }
    }, [queryClient])

    const { status } = useWebSocket({
        url: user ? buildNotificationsWsUrl(actorType, actorId) : null, // Only connect if logged in
        token,
        onMessage: handleMessage,
    })

    return { status }
}
