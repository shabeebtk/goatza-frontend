/**
 * useChatMediaUpload — optimistic photo AND video sending for a conversation.
 *
 * Per item: insert an optimistic bubble (local object-URL preview) into the
 * messages cache immediately, then upload (with progress) → POST the media
 * message, and reconcile the optimistic entry with the server message. Failures
 * leave the bubble in a retryable state.
 *
 * Reconciliation is race-safe against the websocket echo of the same message:
 * we remove the temp entry and only add the server message if it isn't already
 * present (the WS handler dedups by server id), so the two paths converge to a
 * single bubble regardless of arrival order.
 */

import { useCallback, useRef } from "react"
import { InfiniteData, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import { conversationKeys } from "./useConversationQueries"
import type { ChatMessage } from "./useChatSocket"
import {
    MessagesResponse,
    Message,
    sendImageMessageApi,
    sendVideoMessageApi,
} from "../services/conversations.api"
import {
    uploadChatImage,
    uploadChatVideo,
    getImageDimensions,
    captureVideoThumbnail,
    getVideoMeta,
} from "../services/chatUpload.service"

type OptimisticMedia = Message & Partial<ChatMessage>

type Job = {
    kind: "image" | "video"
    file: File
    caption: string
    localUrl: string       // object URL used as the bubble preview (revoke on done)
    durationSec?: number   // video fallback duration
}

export function useChatMediaUpload(conversationId: string | null) {
    const queryClient = useQueryClient()
    const user = useAuthStore((s) => s.user)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)

    const myId =
        actorType === "organization" && actorId ? actorId : user?.id

    // File + caption kept per temp id so a failed upload can be retried.
    const jobsRef = useRef<Map<string, Job>>(new Map())

    const cacheKey = conversationId
        ? conversationKeys.messages(conversationId)
        : null

    // ── cache helpers ─────────────────────────────────────────
    const patchMessage = useCallback(
        (tempId: string, patch: Partial<OptimisticMedia>) => {
            if (!cacheKey) return
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                cacheKey,
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        pages: old.pages.map((p) => ({
                            ...p,
                            results: p.results.map((m) =>
                                m.id === tempId ? { ...m, ...patch } : m
                            ),
                        })),
                    }
                }
            )
        },
        [cacheKey, queryClient]
    )

    const insertOptimistic = useCallback(
        (msg: OptimisticMedia) => {
            if (!cacheKey) return
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                cacheKey,
                (old) => {
                    if (!old || !old.pages[0]) return old
                    return {
                        ...old,
                        pages: [
                            {
                                ...old.pages[0],
                                results: [msg, ...old.pages[0].results],
                            },
                            ...old.pages.slice(1),
                        ],
                    }
                }
            )
        },
        [cacheKey, queryClient]
    )

    const removeMessage = useCallback(
        (tempId: string) => {
            if (!cacheKey) return
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                cacheKey,
                (old) => {
                    if (!old) return old
                    return {
                        ...old,
                        pages: old.pages.map((p) => ({
                            ...p,
                            results: p.results.filter((m) => m.id !== tempId),
                        })),
                    }
                }
            )
        },
        [cacheKey, queryClient]
    )

    const reconcile = useCallback(
        (tempId: string, serverMsg: Message) => {
            if (!cacheKey) return
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                cacheKey,
                (old) => {
                    if (!old) return old
                    const already = old.pages.some((p) =>
                        p.results.some((m) => m.id === serverMsg.id)
                    )
                    return {
                        ...old,
                        pages: old.pages.map((p, i) => {
                            let results = p.results.filter(
                                (m) => m.id !== tempId
                            )
                            if (i === 0 && !already) {
                                results = [serverMsg, ...results]
                            }
                            return { ...p, results }
                        }),
                    }
                }
            )
        },
        [cacheKey, queryClient]
    )

    // ── the upload pipeline for one temp id ───────────────────
    const runUpload = useCallback(
        async (tempId: string) => {
            const job = jobsRef.current.get(tempId)
            if (!job || !conversationId) return

            patchMessage(tempId, {
                failed: false,
                pending: true,
                uploadProgress: 0,
            })

            const onProgress = (loaded: number, total: number) => {
                // Round to 5% steps to limit cache churn/re-renders.
                const pct = Math.min(99, Math.round((loaded / total) * 20) * 5)
                patchMessage(tempId, { uploadProgress: pct })
            }

            try {
                let serverMsg: Message
                if (job.kind === "video") {
                    const uploaded = await uploadChatVideo(
                        job.file,
                        onProgress,
                        job.durationSec
                    )
                    serverMsg = await sendVideoMessageApi(conversationId, {
                        media_url: uploaded.media_url,
                        media_public_id: uploaded.media_public_id,
                        width: uploaded.width,
                        height: uploaded.height,
                        duration_ms: uploaded.duration_ms,
                        size_bytes: uploaded.size_bytes,
                        caption: job.caption,
                    })
                } else {
                    const uploaded = await uploadChatImage(job.file, onProgress)
                    serverMsg = await sendImageMessageApi(conversationId, {
                        media_url: uploaded.media_url,
                        media_public_id: uploaded.media_public_id,
                        width: uploaded.width,
                        height: uploaded.height,
                        size_bytes: uploaded.size_bytes,
                        caption: job.caption,
                    })
                }

                reconcile(tempId, serverMsg)
                URL.revokeObjectURL(job.localUrl)
                jobsRef.current.delete(tempId)

                // Reorder the conversations list + refresh its preview line.
                queryClient.invalidateQueries({
                    queryKey: conversationKeys.all(),
                })
            } catch {
                patchMessage(tempId, { failed: true, pending: false })
            }
        },
        [conversationId, patchMessage, reconcile, queryClient]
    )

    // ── send photos ───────────────────────────────────────────
    const sendImages = useCallback(
        async (files: File[], caption: string) => {
            if (!conversationId || !myId || files.length === 0) return

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const tempId = `img_${Date.now()}_${i}_${Math.random()
                    .toString(36)
                    .slice(2)}`
                const localUrl = URL.createObjectURL(file)
                // Instagram-style: the caption rides on the LAST image only.
                const cap = i === files.length - 1 ? caption : ""

                let dims = { width: 0, height: 0 }
                try {
                    dims = await getImageDimensions(file)
                } catch {
                    /* keep 0 → bubble falls back to a square box */
                }

                jobsRef.current.set(tempId, {
                    kind: "image",
                    file,
                    caption: cap,
                    localUrl,
                })

                insertOptimistic({
                    id: tempId,
                    message_type: "image",
                    content: cap,
                    sender_id: myId,
                    created_at: new Date().toISOString(),
                    media_url: "",
                    media_width: dims.width || null,
                    media_height: dims.height || null,
                    localPreviewUrl: localUrl,
                    uploadProgress: 0,
                    pending: true,
                })

                void runUpload(tempId)
            }
        },
        [conversationId, myId, insertOptimistic, runUpload]
    )

    // ── send one video ────────────────────────────────────────
    const sendVideo = useCallback(
        async (file: File, caption: string) => {
            if (!conversationId || !myId) return

            const tempId = `vid_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`

            // Poster frame + intrinsic size for the optimistic bubble.
            let meta = { durationSec: 0, width: 0, height: 0 }
            try {
                meta = await getVideoMeta(file)
            } catch {
                /* fall back to a square box */
            }
            let poster = ""
            try {
                poster = await captureVideoThumbnail(file)
            } catch {
                /* bubble shows a neutral box until the server thumbnail lands */
            }

            jobsRef.current.set(tempId, {
                kind: "video",
                file,
                caption,
                localUrl: poster,
                durationSec: meta.durationSec,
            })

            insertOptimistic({
                id: tempId,
                message_type: "video",
                content: caption,
                sender_id: myId,
                created_at: new Date().toISOString(),
                media_url: "",
                media_width: meta.width || null,
                media_height: meta.height || null,
                media_duration_ms: meta.durationSec
                    ? Math.round(meta.durationSec * 1000)
                    : null,
                localPreviewUrl: poster || undefined,
                uploadProgress: 0,
                pending: true,
            })

            void runUpload(tempId)
        },
        [conversationId, myId, insertOptimistic, runUpload]
    )

    const retry = useCallback(
        (tempId: string) => {
            void runUpload(tempId)
        },
        [runUpload]
    )

    const remove = useCallback(
        (tempId: string) => {
            const job = jobsRef.current.get(tempId)
            if (job) {
                if (job.localUrl) URL.revokeObjectURL(job.localUrl)
                jobsRef.current.delete(tempId)
            }
            removeMessage(tempId)
        },
        [removeMessage]
    )

    return { sendImages, sendVideo, retry, remove }
}
