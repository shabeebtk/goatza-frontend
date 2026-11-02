// @vitest-environment jsdom
/**
 * useChatMediaUpload with the server converting: the bubble goes from
 * uploading to "Processing…" to sent — and a job the server could not
 * convert leaves a failed bubble plus a toast with the server's sentence.
 *
 * The upload functions are mocked (chatUpload.service.test.ts covers them);
 * what is under test is what the bubble and the send are given.
 */

import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const upload = vi.hoisted(() => ({
    uploadChatVideo: vi.fn(),
    uploadChatImage: vi.fn(),
    getImageDimensions: vi.fn(async () => ({ width: 0, height: 0 })),
    captureVideoThumbnail: vi.fn(async () => ""),
}))
const send = vi.hoisted(() => ({
    sendVideoMessageApi: vi.fn(),
    sendImageMessageApi: vi.fn(),
}))
const toast = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("../services/chatUpload.service", () => upload)
vi.mock("../services/conversations.api", () => send)
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => toast }))
vi.mock("@/shared/hooks/useScreenWakeLock", () => ({ holdScreenWakeLock: () => () => {} }))

import { MediaJobError } from "@/shared/services/sourceUpload"
import { useAuthStore } from "@/store/auth.store"
import type { MessagesResponse } from "../services/conversations.api"
import { conversationKeys } from "./useConversationQueries"
import { useChatMediaUpload } from "./useChatImageUpload"

const KEY = conversationKeys.messages("c-1")

let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

const bubbles = () =>
    client.getQueryData<InfiniteData<MessagesResponse>>(KEY)!.pages[0].results as Array<
        Record<string, unknown>
    >

const clip = () => new File([new Uint8Array(4)], "match.mkv", { type: "video/x-matroska" })

beforeEach(() => {
    for (const mock of [...Object.values(upload), ...Object.values(send), toast.show]) {
        mock.mockClear()
    }
    upload.uploadChatVideo.mockReset()
    send.sendVideoMessageApi.mockReset()

    useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
    })
    client = new QueryClient()
    client.setQueryData<InfiniteData<MessagesResponse>>(KEY, {
        pages: [{ results: [], next_cursor: null, previous: null }],
        pageParams: [null],
    })
})

afterEach(cleanup)

describe("a video the server converts", () => {
    it("shows Processing…, then sends with the job's duration in ms", async () => {
        let finish: (value: unknown) => void = () => {}
        upload.uploadChatVideo.mockImplementation(
            (_file, _progress, _duration, _signal, options: { onProcessing?: () => void }) => {
                options.onProcessing?.()
                return new Promise((resolve) => {
                    finish = resolve
                })
            }
        )
        send.sendVideoMessageApi.mockResolvedValue({
            id: "msg-1",
            message_type: "video",
            content: "goal",
            sender_id: "user-1",
            created_at: new Date().toISOString(),
            media_url: "https://media.goatza.test/chat/a.mp4",
        })

        const { result } = renderHook(() => useChatMediaUpload("c-1"), { wrapper })
        await act(() => result.current.sendVideo(clip(), "goal", { durationSec: 0 }))

        await waitFor(() =>
            expect(bubbles()[0]).toMatchObject({ pending: true, processing: true })
        )
        expect(send.sendVideoMessageApi).not.toHaveBeenCalled()

        await act(async () => {
            finish({
                media_url: "https://media.goatza.test/chat/a.mp4",
                media_public_id: "chat/a.mp4",
                thumbnail_url: "https://media.goatza.test/chat/a.jpg",
                width: 1280,
                height: 720,
                size_bytes: 4_000_000,
                duration_ms: 12_345,
            })
        })

        await waitFor(() => expect(send.sendVideoMessageApi).toHaveBeenCalledTimes(1))
        expect(send.sendVideoMessageApi).toHaveBeenCalledWith(
            "c-1",
            expect.objectContaining({
                media_url: "https://media.goatza.test/chat/a.mp4",
                media_public_id: "chat/a.mp4",
                thumbnail_url: "https://media.goatza.test/chat/a.jpg",
                duration_ms: 12_345,
                caption: "goal",
            }),
            { type: "user" }
        )
        await waitFor(() => expect(bubbles()[0].id).toBe("msg-1"))
    })

    it("an account switch mid-send: still uploaded and sent as the sender", async () => {
        useAuthStore.setState({ actorType: "organization", actorId: "org-1" } as never)
        let finish: (value: unknown) => void = () => {}
        upload.uploadChatVideo.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve
                })
        )
        send.sendVideoMessageApi.mockResolvedValue({
            id: "msg-2",
            message_type: "video",
            content: "",
            sender_id: "org-1",
            created_at: new Date().toISOString(),
        })

        const { result } = renderHook(() => useChatMediaUpload("c-1"), { wrapper })
        await act(() => result.current.sendVideo(clip(), "", { durationSec: 0 }))

        // The club admin switches to their own account while it converts.
        useAuthStore.setState({ actorType: "user", actorId: null } as never)
        await act(async () => {
            finish({ media_url: "u", media_public_id: "k", thumbnail_url: "t" })
        })

        const club = { type: "organization", id: "org-1" }
        expect(upload.uploadChatVideo.mock.calls[0][4]).toMatchObject({ actor: club })
        await waitFor(() => expect(send.sendVideoMessageApi).toHaveBeenCalledTimes(1))
        expect(send.sendVideoMessageApi.mock.calls[0][2]).toEqual(club)
    })

    it("a job the server could not convert: failed bubble, the server's sentence", async () => {
        upload.uploadChatVideo.mockImplementation(
            async (_f, _p, _d, _s, options: { onProcessing?: () => void }) => {
                options.onProcessing?.()
                throw new MediaJobError("VIDEO_TOO_LONG", "Videos can be at most 1:30 long")
            }
        )

        const { result } = renderHook(() => useChatMediaUpload("c-1"), { wrapper })
        await act(() => result.current.sendVideo(clip(), "", { durationSec: 0 }))

        await waitFor(() =>
            expect(bubbles()[0]).toMatchObject({ failed: true, pending: false, processing: false })
        )
        expect(toast.show).toHaveBeenCalledWith({
            title: "Couldn't send that",
            message: "Videos can be at most 1:30 long",
            variant: "error",
        })
        expect(send.sendVideoMessageApi).not.toHaveBeenCalled()

        // Retry runs the whole thing again.
        upload.uploadChatVideo.mockReset()
        upload.uploadChatVideo.mockReturnValue(new Promise(() => {}))
        act(() => result.current.retry(bubbles()[0].id as string))
        await waitFor(() => expect(upload.uploadChatVideo).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(bubbles()[0]).toMatchObject({ failed: false, processing: false }))
    })
})
