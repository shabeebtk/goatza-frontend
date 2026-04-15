/**
 * useChatSocket — Chat-specific WebSocket hook
 *
 * Wraps useWebSocket with chat-domain message handling.
 * Produces typed ChatMessage objects from raw WS events.
 *
 * Usage:
 *   const { send, status, messages } = useChatSocket(conversationId)
 */

import { useCallback, useRef, useState } from "react"
import { useWebSocket, type WsStatus } from "@/core/ws/useWebSocket"
import { useAuthStore } from "@/store/auth.store"

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
    messages: ChatMessage[]
    send: (text: string) => void
    status: WsStatus
    prependMessages: (msgs: ChatMessage[]) => void
}

// ── Build WS URL ──────────────────────────────────────────────

function buildWsUrl(conversationId: string | null): string | null {
    if (!conversationId) return null
    const base = process.env.NEXT_PUBLIC_API_URL
    return `${base}/ws/chat/${conversationId}/`
}

// ── Hook ──────────────────────────────────────────────────────

export function useChatSocket(conversationId: string | null): UseChatSocketReturn {
    const user = useAuthStore((s) => s.user)
    const token = useAuthStore((s) => s.accessToken)
    const [messages, setMessages] = useState<ChatMessage[]>([])

    // Track optimistic message IDs so we can confirm/replace them
    const pendingRef = useRef<Map<string, string>>(new Map()) // tempId → content

    // ── Handle incoming WS message ────────────────────────────
    const handleMessage = useCallback((data: unknown) => {
        const payload = data as WsIncomingMessage
        if (payload.type !== "message") return
        if (!payload.message_id || !payload.content || !payload.sender_id) return

        const incoming: ChatMessage = {
            id: payload.message_id,
            content: payload.content,
            sender_id: payload.sender_id,
            created_at: payload.created_at ?? new Date().toISOString(),
        }

        setMessages((prev) => {
            // Deduplicate — real message may arrive while optimistic copy exists
            const exists = prev.some((m) => m.id === incoming.id)
            if (exists) return prev

            // If this matches one of our optimistic messages (same content + sender),
            // replace the pending one
            const myId = user?.id ?? ""
            const pendingIdx = prev.findIndex(
                (m) => m.pending && m.sender_id === myId && m.content === incoming.content
            )

            if (pendingIdx !== -1) {
                const updated = [...prev]
                updated[pendingIdx] = incoming
                return updated
            }

            // Someone else's message — append
            return [...prev, incoming]
        })
    }, [user?.id])

    const { send: wsSend, status } = useWebSocket({
        url: buildWsUrl(conversationId),
        token,
        onMessage: handleMessage,
    })

    // ── Send with optimistic update ───────────────────────────
    const send = useCallback((text: string) => {
        const trimmed = text.trim()
        if (!trimmed || !user?.id) return

        // Optimistic insert
        const tempId = `temp_${Date.now()}_${Math.random()}`
        const optimistic: ChatMessage = {
            id: tempId,
            content: trimmed,
            sender_id: user.id,
            created_at: new Date().toISOString(),
            pending: true,
        }
        setMessages((prev) => [...prev, optimistic])
        pendingRef.current.set(tempId, trimmed)

        // Send over WS
        wsSend({ message: trimmed })
    }, [wsSend, user?.id])

    // ── Prepend historical messages (from REST pagination) ────
    const prependMessages = useCallback((msgs: ChatMessage[]) => {
        setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const fresh = msgs.filter((m) => !existingIds.has(m.id))
            return [...fresh, ...prev]
        })
    }, [])

    return { messages, send, status, prependMessages }
}