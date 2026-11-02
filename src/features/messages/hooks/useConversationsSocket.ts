import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { realtimeBus } from "@/core/ws/realtimeBus"
import { invalidateConversationsExceptMessages } from "./useConversationQueries"

/**
 * Keep the conversations list current while it is on screen.
 *
 * It no longer opens a socket of its own: the app-wide NotificationsSocket
 * (AppShell / OrgShell) owns the one ws/notifications/ connection and this
 * listens on the realtime bus for the same event it always handled.
 */
export function useConversationsSocket(): void {
    const queryClient = useQueryClient()

    useEffect(
        () =>
            realtimeBus.on("conversation_updated", () => {
                // Invalidate the conversations list so it fetches the new list.
                // NOT the message history: that key is prefix-matched by
                // conversationKeys.all(), and refetching it replaces
                // `data.pages` wholesale — which deletes any optimistic bubble
                // still uploading. A long video upload is wide open to this;
                // the open chat is kept current by its own websocket anyway.
                invalidateConversationsExceptMessages(queryClient)
            }),
        [queryClient]
    )
}
