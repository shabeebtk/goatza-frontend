/**
 * useChatSocket — Chat-specific WebSocket hook
 *
 * Wraps useWebSocket with chat-domain message handling.
 * Produces typed ChatMessage objects from raw WS events.
 *
 * Usage:
 *   const { send, status, messages } = useChatSocket(conversationId)
 */

import { useCallback, useRef } from "react"
import { useWebSocket, type WsStatus } from "@/core/ws/useWebSocket"
import { useAuthStore } from "@/store/auth.store"
import { useQueryClient, InfiniteData } from "@tanstack/react-query"
import { conversationKeys } from "./useConversationQueries"
import { MessagesResponse, Message } from "../services/conversations.api"

// ── Types ─────────────────────────────────────────────────────

export type ChatMessage = {
    id: string
    content: string
    sender_id: string
    created_at: string
    /** Optimistic messages pending server confirmation */
    pending?: boolean
    failed?: boolean
}

type WsIncomingMessage = {
    type: "message" | "error"
    message_id?: string
    content?: string
    sender_id?: string
    created_at?: string
    message?: string
}

type UseChatSocketReturn = {
    send: (text: string) => void
    status: WsStatus
}

// ── Build WS URL ──────────────────────────────────────────────

function buildWsUrl(conversationId: string | null): string | null {
    if (!conversationId) return null
    const base = process.env.NEXT_PUBLIC_WS_URL
    return `${base}/ws/chat/${conversationId}/`
}

// ── Hook ──────────────────────────────────────────────────────

export function useChatSocket(conversationId: string | null): UseChatSocketReturn {
    const user = useAuthStore((s) => s.user)
    const token = useAuthStore((s) => s.accessToken)
    const queryClient = useQueryClient()

    // Track optimistic message IDs so we can confirm/replace them
    const pendingRef = useRef<Map<string, string>>(new Map()) // tempId → content

    // ── Handle incoming WS message ────────────────────────────
    const handleMessage = useCallback((data: unknown) => {
        const payload = data as WsIncomingMessage
        if (payload.type !== "message") return
        if (!payload.message_id || !payload.content || !payload.sender_id || !conversationId) return

        const incoming: Message = {
            id: payload.message_id,
            content: payload.content,
            message_type: "text",
            sender_id: payload.sender_id,
            created_at: payload.created_at ?? new Date().toISOString(),
        }

        queryClient.setQueryData<InfiniteData<MessagesResponse>>(
            conversationKeys.messages(conversationId),
            (old) => {
                if (!old) return old

                const firstPage = old.pages[0]
                if (!firstPage) return old

                // Deduplicate
                const exists = old.pages.some(p => p.results.some(m => m.id === incoming.id))
                if (exists) return old

                // Find pending optimistic message
                const myId = user?.id ?? ""
                const pendingIdx = firstPage.results.findIndex(
                    (m) => (m as any).pending && m.sender_id === myId && m.content === incoming.content
                )

                const newResults = [...firstPage.results]
                if (pendingIdx !== -1) {
                    newResults[pendingIdx] = incoming
                } else {
                    newResults.unshift(incoming) // Put at the top since index 0 is the newest
                }

                return {
                    ...old,
                    pages: [
                        { ...firstPage, results: newResults },
                        ...old.pages.slice(1)
                    ]
                }
            }
        )
    }, [user?.id, conversationId, queryClient])

    const { send: wsSend, status } = useWebSocket({
        url: buildWsUrl(conversationId),
        token,
        onMessage: handleMessage,
    })

    // ── Send with optimistic update ───────────────────────────
    const send = useCallback((text: string) => {
        const trimmed = text.trim()
        if (!trimmed || !user?.id || !conversationId) return

        // Optimistic insert
        const tempId = `temp_${Date.now()}_${Math.random()}`
        const optimistic: Message & { pending: boolean } = {
            id: tempId,
            content: trimmed,
            message_type: "text",
            sender_id: user.id,
            created_at: new Date().toISOString(),
            pending: true,
        }
        
        queryClient.setQueryData<InfiniteData<MessagesResponse>>(
            conversationKeys.messages(conversationId),
            (old) => {
                if (!old || !old.pages[0]) return old
                return {
                    ...old,
                    pages: [
                        {
                            ...old.pages[0],
                            results: [optimistic, ...old.pages[0].results]
                        },
                        ...old.pages.slice(1)
                    ]
                }
            }
        )
        pendingRef.current.set(tempId, trimmed)

        // Send over WS
        wsSend({ message: trimmed })
    }, [wsSend, user?.id, conversationId, queryClient])

    return { send, status }
}