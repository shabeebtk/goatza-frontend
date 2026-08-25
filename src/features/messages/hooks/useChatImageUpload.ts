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

import { useCallback, useMemo, useRef } from "react"
import { InfiniteData, useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import {
    conversationKeys,
    invalidateConversationsExceptMessages,
} from "./useConversationQueries"
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
} from "../services/chatUpload.service"
import {
    VIDEO_UNSUPPORTED_MESSAGE,
    type VideoUploadPhase,
} from "@/shared/services/videoEncode"
import { isUploadCancelled } from "@/shared/services/mediaUpload"
import { useToast } from "@/shared/components/ui/Toast/Toast"

type OptimisticMedia = Message & Partial<ChatMessage>

type Job = {
    kind: "image" | "video"
    file: File
    caption: string
    localUrl: string       // object URL used as the bubble preview (revoke on done)
    durationSec?: number   // video fallback duration
    /** The optimistic row, kept so it can be restored if a refetch wipes it. */
    optimistic?: OptimisticMedia
    /** Aborts the in-flight upload when the user cancels. */
    controller?: AbortController
}

export function useChatMediaUpload(conversationId: string | null) {
    const queryClient = useQueryClient()
    const toast = useToast()
    const user = useAuthStore((s) => s.user)
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)

    const myId =
        actorType === "organization" && actorId ? actorId : user?.id

    // File + caption kept per temp id so a failed upload can be retried.
    const jobsRef = useRef<Map<string, Job>>(new Map())

    // Memoised: conversationKeys.messages() returns a fresh array literal every
    // render, which would make every callback below unstable and defeat the
    // memoised message bubbles.
    const cacheKey = useMemo(
        () => (conversationId ? conversationKeys.messages(conversationId) : null),
        [conversationId]
    )

    // ── cache helpers ─────────────────────────────────────────
    const patchMessage = useCallback(
        (tempId: string, patch: Partial<OptimisticMedia>) => {
            if (!cacheKey) return
            const job = jobsRef.current.get(tempId)
            queryClient.setQueryData<InfiniteData<MessagesResponse>>(
                cacheKey,
                (old) => {
                    if (!old || !old.pages[0]) return old

                    const present = old.pages.some((p) =>
                        p.results.some((m) => m.id === tempId)
                    )

                    // Self-heal: a refetch of the history replaces `data.pages`
                    // wholesale and takes every in-flight optimistic row with it.
                    // While the job is still ours, put it back rather than
                    // letting the bubble vanish mid-upload.
                    if (!present) {
                        if (!job?.optimistic) return old
                        const restored = { ...job.optimistic, ...patch }
                        job.optimistic = restored
                        return {
                            ...old,
                            pages: [
                                {
                                    ...old.pages[0],
                                    results: [restored, ...old.pages[0].results],
                                },
                                ...old.pages.slice(1),
                            ],
                        }
                    }

                    return {
                        ...old,
                        pages: old.pages.map((p) => ({
                            ...p,
                            results: p.results.map((m) => {
                                if (m.id !== tempId) return m
                                const next = { ...m, ...patch }
                                if (job) job.optimistic = next as OptimisticMedia
                                return next
                            }),
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
                    if (!old || !old.pages[0]) return old
                    const already = old.pages.some((p) =>
                        p.results.some((m) => m.id === serverMsg.id)
                    )
                    const hasTemp = old.pages.some((p) =>
                        p.results.some((m) => m.id === tempId)
                    )

                    // The temp row is gone (a refetch replaced the pages) and the
                    // websocket echo hasn't delivered it either — insert the
                    // server message so a successful send can never vanish.
                    if (!hasTemp) {
                        if (already) return old
                        return {
                            ...old,
                            pages: [
                                {
                                    ...old.pages[0],
                                    results: [serverMsg, ...old.pages[0].results],
                                },
                                ...old.pages.slice(1),
                            ],
                        }
                    }

                    return {
                        ...old,
                        pages: old.pages.map((p) => {
                            const idx = p.results.findIndex((m) => m.id === tempId)
                            if (idx === -1) return p
                            const results = [...p.results]
                            // Swap IN PLACE. Prepending instead would reorder a
                            // multi-photo batch by upload-completion time, and
                            // nothing refetches the history to heal it.
                            if (already) results.splice(idx, 1)
                            else results[idx] = serverMsg
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

            const controller = new AbortController()
            job.controller = controller

            patchMessage(tempId, {
                failed: false,
                pending: true,
                uploadProgress: 0,
            })

            const onProgress = (
                loaded: number,
                total: number,
                phase?: VideoUploadPhase
            ) => {
                // Round to 5% steps to limit cache churn/re-renders.
                const pct = Math.min(99, Math.round((loaded / total) * 20) * 5)
                patchMessage(tempId, {
                    uploadProgress: pct,
                    // The encode is the first 70% and the slower half on a
                    // phone; the bubble labels it rather than showing a
                    // stalled "uploading".
                    optimizing: phase === "encoding",
                })
            }

            try {
                let serverMsg: Message
                if (job.kind === "video") {
                    const uploaded = await uploadChatVideo(
                        job.file,
                        onProgress,
                        job.durationSec,
                        controller.signal
                    )
                    // Correlation key for the websocket echo — see below.
                    patchMessage(tempId, { pendingMediaUrl: uploaded.media_url })
                    serverMsg = await sendVideoMessageApi(conversationId, {
                        media_url: uploaded.media_url,
                        media_public_id: uploaded.media_public_id,
                        // REQUIRED for a video: nothing derives a poster
                        // server-side, and the send is rejected without one.
                        thumbnail_url: uploaded.thumbnail_url,
                        width: uploaded.width,
                        height: uploaded.height,
                        duration_ms: uploaded.duration_ms,
                        size_bytes: uploaded.size_bytes,
                        caption: job.caption,
                    })
                } else {
                    const uploaded = await uploadChatImage(
                        job.file,
                        onProgress,
                        controller.signal
                    )
                    // Correlation key for the websocket echo — see below.
                    patchMessage(tempId, { pendingMediaUrl: uploaded.media_url })
                    serverMsg = await sendImageMessageApi(conversationId, {
                        media_url: uploaded.media_url,
                        media_public_id: uploaded.media_public_id,
                        thumbnail_url: uploaded.thumbnail_url,
                        width: uploaded.width,
                        height: uploaded.height,
                        size_bytes: uploaded.size_bytes,
                        caption: job.caption,
                    })
                }

                // If the history cache wasn't populated yet (message sent while
                // the conversation was still loading), the optimistic insert and
                // this reconcile both no-op — refetch so the message appears.
                const hadCache = Boolean(
                    cacheKey &&
                    queryClient.getQueryData<InfiniteData<MessagesResponse>>(cacheKey)
                        ?.pages?.[0]
                )
                reconcile(tempId, serverMsg)
                if (!hadCache && cacheKey) {
                    queryClient.invalidateQueries({ queryKey: cacheKey })
                }
                URL.revokeObjectURL(job.localUrl)
                jobsRef.current.delete(tempId)

                // Reorder the conversations list + refresh its preview line.
                // Deliberately NOT the message history: refetching it here would
                // replace `data.pages` and wipe the sibling photos still uploading.
                invalidateConversationsExceptMessages(queryClient)
            } catch (err) {
                // Cancelled uploads have already had their job and bubble
                // removed — don't resurrect them as a failed message.
                if (!jobsRef.current.has(tempId)) return
                if (isUploadCancelled(err)) return
                patchMessage(tempId, { failed: true, pending: false, optimizing: false })

                // A failed bubble alone cannot say WHY. It matters most for the
                // one case the user can act on: a video this device could not
                // encode, where "try a different file" is the whole fix.
                const message = err instanceof Error ? err.message : ""
                if (message === VIDEO_UNSUPPORTED_MESSAGE) {
                    toast.show({ title: message, variant: "error" })
                }
            }
        },
        [conversationId, cacheKey, patchMessage, reconcile, queryClient, toast]
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

                const optimistic: OptimisticMedia = {
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
                }

                jobsRef.current.set(tempId, {
                    kind: "image",
                    file,
                    caption: cap,
                    localUrl,
                    optimistic,
                })

                insertOptimistic(optimistic)

                void runUpload(tempId)
            }
        },
        [conversationId, myId, insertOptimistic, runUpload]
    )

    // ── send one video ────────────────────────────────────────
    /**
     * `meta` is what the composer already measured while staging the file, so
     * the bubble can be drawn at the right size without probing again.
     */
    const sendVideo = useCallback(
        async (
            file: File,
            caption: string,
            meta?: { durationSec?: number; width?: number; height?: number }
        ) => {
            if (!conversationId || !myId) return

            const tempId = `vid_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`

            const durationSec = meta?.durationSec ?? 0

            const optimistic: OptimisticMedia = {
                id: tempId,
                message_type: "video",
                content: caption,
                sender_id: myId,
                created_at: new Date().toISOString(),
                media_url: "",
                media_width: meta?.width || null,
                media_height: meta?.height || null,
                media_duration_ms: durationSec
                    ? Math.round(durationSec * 1000)
                    : null,
                uploadProgress: 0,
                pending: true,
            }

            jobsRef.current.set(tempId, {
                kind: "video",
                file,
                caption,
                localUrl: "",
                durationSec,
                optimistic,
            })

            // Show the bubble and START THE UPLOAD FIRST. Everything below is
            // cosmetic: probing a <video> on a phone can stall for seconds, and
            // gating the send on it used to make the message silently vanish —
            // the composer clears the staged chip immediately, so a stalled
            // probe left nothing on screen at all.
            insertOptimistic(optimistic)
            void runUpload(tempId)

            // Poster frame, best-effort, patched in when (if) it arrives.
            let poster = ""
            try {
                poster = await captureVideoThumbnail(file)
            } catch {
                /* bubble keeps its neutral box until the server thumbnail lands */
            }
            const job = jobsRef.current.get(tempId)
            if (!poster) return
            if (!job) {
                // Upload already finished/cancelled — nothing to attach it to.
                URL.revokeObjectURL(poster)
                return
            }
            job.localUrl = poster
            patchMessage(tempId, { localPreviewUrl: poster })
        },
        [conversationId, myId, insertOptimistic, runUpload, patchMessage]
    )

    const retry = useCallback(
        (tempId: string) => {
            void runUpload(tempId)
        },
        [runUpload]
    )

    /**
     * Remove a media message the user no longer wants — cancels the in-flight
     * upload if it hasn't finished, so this doubles as "cancel upload".
     */
    const remove = useCallback(
        (tempId: string) => {
            const job = jobsRef.current.get(tempId)
            if (job) {
                // Delete the job BEFORE aborting: runUpload's catch checks for
                // it to tell a cancel apart from a real failure.
                jobsRef.current.delete(tempId)
                job.controller?.abort()
                if (job.localUrl) URL.revokeObjectURL(job.localUrl)
            }
            removeMessage(tempId)
        },
        [removeMessage]
    )

    return { sendImages, sendVideo, retry, remove }
}
