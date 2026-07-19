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
import {
    MessagesResponse,
    Message,
    MessageType,
    SharedRecruitmentPreview,
    SharedPostPreview,
} from "../services/conversations.api"

// ── Types ─────────────────────────────────────────────────────

export type ChatMessage = {
    id: string
    content: string
    sender_id: string
    created_at: string
    /** Defaults to "text" for legacy payloads that omit it. */
    message_type?: MessageType
    shared_recruitment_preview?: SharedRecruitmentPreview | null
    shared_post_preview?: SharedPostPreview | null

    // Photo / video messages
    media_url?: string
    media_thumbnail_url?: string
    media_width?: number | null
    media_height?: number | null
    media_duration_ms?: number | null
    /** Optimistic-only: local object-URL preview shown while uploading. */
    localPreviewUrl?: string
    /** Optimistic-only: 0–100 upload progress. */
    uploadProgress?: number

    /** Optimistic messages pending server confirmation */
    pending?: boolean
    failed?: boolean
}

type WsIncomingMessage = {
    type: "message" | "error"
    /**
     * type === "message": the full serialized message (same shape as the REST
     * list). type === "error": a human-readable string. The handler only ever
     * touches this on the "message" branch, so the union is fine.
     */
    message?: Message | string
    // ── Deprecated flat fields (still echoed by the backend for back-compat) ──
    message_id?: string
    content?: string
    sender?: { id?: string } & Record<string, unknown>
    created_at?: string
}

type UseChatSocketReturn = {
    send: (text: string) => void
    status: WsStatus
}

// ── Build WS URL ──────────────────────────────────────────────

function buildWsUrl(
    conversationId: string | null,
    actorType: "user" | "organization",
    actorId: string | null
): string | null {
    if (!conversationId) return null
    const base = process.env.NEXT_PUBLIC_WS_URL
    let url = `${base}/ws/chat/${conversationId}/`
    
    if (actorType === "organization" && actorId) {
        url += `?actor_type=organization&org_id=${actorId}`
    }
    
    return url
}

// ── Hook ──────────────────────────────────────────────────────

export function useChatSocket(conversationId: string | null): UseChatSocketReturn {
    const user = useAuthStore((s) => s.user)
    const token = useAuthStore((s) => s.accessToken)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)
    const queryClient = useQueryClient()

    // Track optimistic message IDs so we can confirm/replace them
    const pendingRef = useRef<Map<string, string>>(new Map()) // tempId → content

    // ── Handle incoming WS message ────────────────────────────
    const handleMessage = useCallback((data: unknown) => {
        const payload = data as WsIncomingMessage
        if (payload.type !== "message" || !conversationId) return

        // Prefer the full serialized message (carries message_type + shared
        // previews). Fall back to the deprecated flat fields for old servers.
        // NOTE: don't gate on `content` — a shared recruitment with no caption
        // has content === "", and the old guard silently dropped it.
        const full =
            payload.message && typeof payload.message === "object"
                ? (payload.message as Message)
                : null

        let incoming: Message
        if (full && full.id && (full.sender?.id || full.sender_id)) {
            incoming = {
                ...full,
                sender_id: full.sender?.id ?? full.sender_id,
                message_type: full.message_type ?? "text",
                created_at: full.created_at ?? new Date().toISOString(),
            }
        } else if (payload.message_id && payload.sender?.id) {
            incoming = {
                id: payload.message_id,
                content: payload.content ?? "",
                message_type: "text",
                sender_id: payload.sender.id,
                sender: payload.sender as Message["sender"],
                created_at: payload.created_at ?? new Date().toISOString(),
            }
        } else {
            return
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

                // Find pending optimistic message. Only text is sent
                // optimistically (via send()); shared content comes in through
                // the REST share endpoint, so never reconcile it against a
                // pending text slot — always append it fresh.
                const myId = actorType === "organization" && actorId ? actorId : (user?.id ?? "")
                const pendingIdx =
                    (incoming.message_type ?? "text") === "text"
                        ? firstPage.results.findIndex(
                              (m) =>
                                  (m as Message & { pending?: boolean }).pending &&
                                  m.sender_id === myId &&
                                  m.content === incoming.content
                          )
                        : -1

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
    }, [user?.id, actorType, actorId, conversationId, queryClient])

    const { send: wsSend, status } = useWebSocket({
        url: buildWsUrl(conversationId, actorType, actorId),
        token,
        onMessage: handleMessage,
    })

    // ── Send with optimistic update ───────────────────────────
    const send = useCallback((text: string) => {
        const trimmed = text.trim()
        const myId = actorType === "organization" && actorId ? actorId : user?.id
        
        if (!trimmed || !myId || !conversationId) return

        // Optimistic insert
        const tempId = `temp_${Date.now()}_${Math.random()}`
        const optimistic: Message & { pending: boolean } = {
            id: tempId,
            content: trimmed,
            message_type: "text",
            sender_id: myId,
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
    }, [wsSend, user?.id, actorType, actorId, conversationId, queryClient])

    return { send, status }
}