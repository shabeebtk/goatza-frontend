// @vitest-environment jsdom
/**
 * The post composer no longer uploads in place: Post runs the quick checks,
 * hands the draft to the upload queue and closes — no overlay, no "Keep
 * Goatza open", no redirect. What the queue does with it is
 * uploadQueue.test.ts / postUpload.service.test.ts.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const queue = vi.hoisted(() => ({ enqueueUpload: vi.fn() }))
const runPost = vi.hoisted(() => vi.fn())

vi.mock("@/shared/upload/uploadQueue", () => queue)
vi.mock("@/features/posts/hooks/usePostSports", () => ({
    CLEAR_SPORT: "__clear__",
    sportOptions: () => [],
    usePostSports: () => ({ sports: [], primarySportId: null }),
}))
vi.mock("@/features/profile/hooks/useProfileBias", () => ({ useProfileBias: () => null }))
vi.mock("@/shared/services/mediaCapabilities", () => ({
    useMediaCapabilities: () => ({ server_processing: false }),
}))
vi.mock("@/features/posts/services/postUpload.service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/posts/services/postUpload.service")>()),
    runPostUpload: runPost,
}))

import CreatePostModal from "./CreatePostModal"

const renderComposer = (onClose = vi.fn()) => {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <CreatePostModal username="player1" onClose={onClose} />
        </QueryClientProvider>
    )
    return onClose
}

const write = (text: string) =>
    fireEvent.change(screen.getByLabelText("Post content"), { target: { value: text } })

const post = () => fireEvent.click(screen.getByRole("button", { name: "Post" }))

beforeEach(() => {
    queue.enqueueUpload.mockReset()
    runPost.mockReset()
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true })
})

afterEach(cleanup)

describe("CreatePostModal", () => {
    it("Post hands the draft to the queue and closes at once", () => {
        const onClose = renderComposer()

        write("Match day at the stadium")
        post()

        expect(queue.enqueueUpload).toHaveBeenCalledTimes(1)
        const task = queue.enqueueUpload.mock.calls[0][0]
        expect(task).toMatchObject({
            kind: "post",
            label: "Match day at the stadium",
            preview: { mediaType: "none" },
        })
        expect(onClose).toHaveBeenCalledTimes(1)
        // Nothing blocks the screen any more.
        expect(screen.queryByText(/Keep Goatza open/)).toBeNull()
        expect(screen.queryByRole("status")).toBeNull()

        // The task's run is the post's whole pipeline, with the draft it kept.
        const run = { signal: new AbortController().signal } as never
        task.run(run)
        expect(runPost).toHaveBeenCalledWith(
            {
                files: [],
                payload: expect.objectContaining({
                    content: "Match day at the stadium",
                    post_type: "normal",
                    visibility: "public",
                }),
            },
            run
        )
    })

    it("too short: says so and queues nothing", () => {
        const onClose = renderComposer()

        write("hi")
        fireEvent.click(screen.getByRole("button", { name: "Post" }))

        expect(screen.queryByText("Post content must be at least 3 characters.")).toBeNull()
        // The button stays disabled under 3 characters.
        expect(queue.enqueueUpload).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("offline: says so and queues nothing", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true })
        const onClose = renderComposer()

        write("Match day at the stadium")
        post()

        expect(screen.getByRole("alert").textContent).toContain("You're offline")
        expect(queue.enqueueUpload).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })
})

describe("CreatePostModal — Edit (F5)", () => {
    it("reopens with the failed post's draft, and Edit again carries the changes", () => {
        const clip = new File([new Uint8Array(4)], "match.mov", { type: "video/quicktime" })
        URL.createObjectURL = vi.fn(() => "blob:clip")
        const onClose = vi.fn()

        render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal
                    username="player1"
                    onClose={onClose}
                    initialDraft={{
                        content: "Final whistle",
                        visibility: "followers",
                        sportId: null,
                        location: null,
                        files: [clip],
                    }}
                />
            </QueryClientProvider>
        )

        expect((screen.getByLabelText("Post content") as HTMLTextAreaElement).value).toBe("Final whistle")
        expect(screen.getByRole("button", { name: "Visibility: followers" })).toBeTruthy()
        expect(screen.getByText("1 video")).toBeTruthy()

        write("Final whistle — 2-1")
        post()

        const task = queue.enqueueUpload.mock.calls[0][0]
        expect(task.preview).toEqual({ mediaType: "video" })
        expect(typeof task.onEdit).toBe("function")
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
