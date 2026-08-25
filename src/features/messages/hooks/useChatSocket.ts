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
import { useQueryClient, InfiniteData } from "@tanstack/react-query"
import { conversationKeys } from "./useConversationQueries"
import {
    MessagesResponse,
    Message,
    MessageType,
    SharedRecruitmentPreview,
    SharedPostPreview,
    SharedOrgProfilePreview,
    SharedUserProfilePreview,
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
    shared_user_profile_preview?: SharedUserProfilePreview | null
    shared_org_profile_preview?: SharedOrgProfilePreview | null

    // Photo / video messages
    media_url?: string
    media_thumbnail_url?: string
    media_width?: number | null
    media_height?: number | null
    media_duration_ms?: number | null
    /** Optimistic-only: local object-URL preview shown while uploading. */
    localPreviewUrl?: string
    /**
     * Optimistic-only: 0–100 across the WHOLE operation. For a video the first
     * 70% is the in-browser encode and the last 30% the upload.
     */
    uploadProgress?: number
    /**
     * Optimistic-only: true while a video is being re-encoded, before any bytes
     * move. The bubble labels this phase rather than showing a stalled
     * "uploading" through the slower half.
     */
    optimizing?: boolean
    /**
     * Optimistic-only: the stored media URL, stamped on as soon as the upload
     * finishes but before our own POST returns. Used to match the websocket
     * echo of this very message to its optimistic row.
     */
    pendingMediaUrl?: string

    /**
     * Seen by the other participant at load time. A snapshot — it never
     * un-sets, and `otherLastReadAt` covers everything read since.
     */
    is_read?: boolean

    /** Optimistic messages pending server confirmation */
    pending?: boolean
    failed?: boolean
}

type WsIncomingMessage = {
    type: "message" | "error" | "message_deleted" | "conversation_read"
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
    // ── type === "conversation_read" ──
    /** Actor id of whoever read the thread — may be this user, on another device. */
    reader_id?: string
    /** ISO timestamp: everything sent at or before it has been seen. */
    last_read_at?: string
}

type UseChatSocketReturn = {
    send: (text: string) => void
    status: WsStatus
    /**
     * Epoch ms of the other participant's latest read, or 0 if they haven't
     * read anything since this window opened. A watermark, not per-message
     * state: one value flips every bubble at or before it, so a reader
     * catching up on a burst costs one render, not one per message.
     */
    otherLastReadAt: number
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

    // Read watermark, tagged with the conversation it came from: switching
    // threads must not carry the previous one's receipt into the new window
    // for the frame before it resets.
    const [readMark, setReadMark] = useState({ conversationId: "", atMs: 0 })

    // ── Handle incoming WS message ────────────────────────────
    const handleMessage = useCallback((data: unknown) => {
        const payload = data as WsIncomingMessage
        if (!conversationId) return

        // The other side read the thread — or we did, on another device.
        if (payload.type === "conversation_read") {
            const atMs = payload.last_read_at ? Date.parse(payload.last_read_at) : NaN
            if (!payload.reader_id || Number.isNaN(atMs)) return

            const myId = actorType === "organization" && actorId ? actorId : user?.id

            if (payload.reader_id === myId) {
                // Our own read echoed back. Nothing to repaint — a receipt is
                // about what the OTHER side has seen — but this is how a read
                // on another device clears the badges here.
                queryClient.setQueryData(
                    conversationKeys.detail(conversationId),
                    (old: unknown) =>
                        old && typeof old === "object" ? { ...old, unread_count: 0 } : old
                )
                queryClient.setQueriesData(
                    { queryKey: ["conversations", "list"] },
                    (old: unknown) => {
                        if (!Array.isArray(old)) return old
                        return old.map((conv: { id: string; unread_count: number }) =>
                            conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
                        )
                    }
                )
                queryClient.invalidateQueries({ queryKey: conversationKeys.unreadSummary() })
                return
            }

            // Monotonic: a late-delivered older receipt must never walk the
            // ticks backwards from blue to grey.
            setReadMark((prev) =>
                prev.conversationId === conversationId && prev.atMs >= atMs
                    ? prev
                    : { conversationId, atMs }
            )
            return
        }

        // Someone unsent a message (possibly this user, on another device).
        if (payload.type === "message_deleted") {
            const deletedId = payload.message_id
            if (!deletedId) return
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                conversationKeys.messages(conversationId),
                (old) =>
                    old
                        ? {
                              ...old,
                              pages: old.pages.map((p) => ({
                                  ...p,
                                  results: p.results.filter(
                                      (m) => m.id !== deletedId
                                  ),
                              })),
                          }
                        : old
            )
            return
        }

        if (payload.type !== "message") return

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
                // pending text slot — always append it fresh. That covers the
                // two shared-profile types with no change: neither is "text"
                // nor media, so both fall through to pendingIdx === -1.
                const myId = actorType === "organization" && actorId ? actorId : (user?.id ?? "")
                const incomingType = incoming.message_type ?? "text"

                // Media: the echo routinely beats the upload's own HTTP response,
                // and prepending it then showed BOTH the still-uploading bubble
                // and the finished one until reconcile caught up. The upload hook
                // stamps `pendingMediaUrl` on its optimistic row as soon as
                // the upload finishes, so the echo can be matched to it exactly
                // and swapped in place instead.
                const mediaIdx =
                    (incomingType === "image" || incomingType === "video") &&
                    incoming.media_url
                        ? firstPage.results.findIndex(
                              (m) =>
                                  (m as Message & { pending?: boolean }).pending &&
                                  m.sender_id === myId &&
                                  (m as Message & { pendingMediaUrl?: string })
                                      .pendingMediaUrl === incoming.media_url
                          )
                        : -1

                const pendingIdx =
                    mediaIdx !== -1
                        ? mediaIdx
                        : incomingType === "text"
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

    return {
        send,
        status,
        otherLastReadAt:
            readMark.conversationId === conversationId ? readMark.atMs : 0,
    }
}