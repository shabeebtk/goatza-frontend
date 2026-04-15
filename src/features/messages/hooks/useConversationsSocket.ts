import { useCallback, useEffect } from "react"
import { useWebSocket } from "@/core/ws/useWebSocket"
import { useAuthStore } from "@/store/auth.store"
import { useQueryClient } from "@tanstack/react-query"
import { conversationKeys } from "./useConversationQueries"

function buildNotificationsWsUrl(): string | null {
    const base = process.env.NEXT_PUBLIC_WS_URL
    return `${base}/ws/notifications/`
}

export function useConversationsSocket() {
    const user = useAuthStore((s) => s.user)
    const token = useAuthStore((s) => s.accessToken)
    const queryClient = useQueryClient()

    const handleMessage = useCallback((data: unknown) => {
        const payload = data as { notification_type?: string, conversation_id?: string }
        if (payload.notification_type === "conversation_updated") {
            // Invalidate the conversations list so it fetches the new list
            queryClient.invalidateQueries({ queryKey: conversationKeys.all() })
        }
    }, [queryClient])

    const { status } = useWebSocket({
        url: user ? buildNotificationsWsUrl() : null, // Only connect if logged in
        token,
        onMessage: handleMessage,
    })

    return { status }
}
