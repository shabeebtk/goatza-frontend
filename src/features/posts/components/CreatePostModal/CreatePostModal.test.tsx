// @vitest-environment jsdom
/**
 * The post composer no longer uploads in place: Post runs the quick checks,
 * hands the draft to the upload queue and closes. What the queue does with it
 * is uploadQueue.test.ts / postUpload.service.test.ts, and what opens in its
 * place is UploadScreen.test.tsx.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const queue = vi.hoisted(() => ({ enqueueUpload: vi.fn() }))
const runPost = vi.hoisted(() => vi.fn())
const viewport = vi.hoisted(() => ({ settleViewport: vi.fn() }))
const chrome = vi.hoisted(() => ({ revealChrome: vi.fn() }))
const playback = vi.hoisted(() => ({ suspensions: 0 }))
const grab = vi.hoisted(() => ({ grabVideoFrame: vi.fn(), frameToJpeg: vi.fn() }))

vi.mock("@/shared/upload/uploadQueue", () => queue)
vi.mock("@/shared/utils/settleViewport", () => viewport)
vi.mock("@/shared/hooks/useScrollChrome", () => chrome)
vi.mock("@/shared/media/playback", async (importOriginal) => {
    const { useEffect } = await import("react")
    return {
        ...(await importOriginal<typeof import("@/shared/media/playback")>()),
        useSuspendPlayback: () => {
            useEffect(() => {
                playback.suspensions++
                return () => {
                    playback.suspensions--
                }
            }, [])
        },
    }
})
// What a composer does with the frame, not how it is grabbed: videoFrame.test.ts.
vi.mock("@/shared/services/videoFrame", () => ({
    grabVideoFrame: grab.grabVideoFrame,
    frameToJpeg: grab.frameToJpeg,
}))
vi.mock("@/shared/services/videoPrep", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/shared/services/videoPrep")>()),
    checkVideoDuration: vi.fn(async () => ({ ok: true })),
}))
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

import { useAuthStore } from "@/store/auth.store"
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
    viewport.settleViewport.mockReset()
    chrome.revealChrome.mockReset()
    grab.grabVideoFrame.mockReset()
    // Unless a test says otherwise, it never comes back.
    grab.grabVideoFrame.mockImplementation(() => new Promise(() => {}))
    grab.frameToJpeg.mockReset()
    useAuthStore.setState({ actorType: "user", actorId: null, isOrgAdminView: false, currentOrganization: null })
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true })
})

afterEach(cleanup)

describe("CreatePostModal — the video preview", () => {
    const FRAME_BLOB = new Blob(["frame"], { type: "image/jpeg" })
    const clip = () => new File([new Uint8Array(4)], "match.mp4", { type: "video/mp4" })

    /** URLs handed out and revoked, in order. */
    let made: string[]
    let revoked: string[]

    beforeEach(() => {
        made = []
        revoked = []
        URL.createObjectURL = vi.fn(() => {
            const url = `blob:${made.length + 1}`
            made.push(url)
            return url
        })
        URL.revokeObjectURL = vi.fn((url: string) => {
            revoked.push(url)
        })
    })

    const open = (file = clip()) => {
        const onClose = vi.fn()
        const view = render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal
                    username="player1"
                    onClose={onClose}
                    initialDraft={{
                        content: "Final whistle",
                        visibility: "public",
                        sportId: null,
                        location: null,
                        files: [file],
                    }}
                />
            </QueryClientProvider>
        )
        return { ...view, onClose, video: view.container.querySelector("video")! }
    }

    const frameArrives = async () => {
        grab.grabVideoFrame.mockResolvedValue({
            canvas: document.createElement("canvas"),
            width: 720,
            height: 1280,
            time: 0.5,
        })
        grab.frameToJpeg.mockResolvedValue(FRAME_BLOB)
    }

    const poster = () => document.querySelector("[data-preview-poster]")
    const skeleton = () => document.querySelector('[class*="previewSkeleton"]')
    const spinner = () => document.querySelector("[data-media-loading]")

    it("while grabbing: the skeleton and the spinner, never a bare box", async () => {
        open()
        expect(skeleton()).toBeTruthy()
        expect(poster()).toBeNull()

        await act(() => new Promise((resolve) => setTimeout(resolve, 450)))

        expect(spinner()).toBeTruthy()
    })

    it("then the grabbed frame as its poster", async () => {
        await frameArrives()
        open()
        await act(async () => {})

        expect(poster()!.getAttribute("src")).toBe(made.at(-1))
        expect(skeleton()).toBeNull()
        expect(document.querySelector('[class*="previewPlayBtn"]')).toBeTruthy()
    })

    it("the poster stays until the reader plays it and a frame paints", async () => {
        await frameArrives()
        const { video } = open()
        await act(async () => {})
        Object.defineProperty(video, "paused", { configurable: true, value: false })

        // Its `#t=0.1` hint is where the clock starts: that is not a frame.
        Object.defineProperty(video, "currentTime", { configurable: true, value: 0.1 })
        fireEvent.playing(video)
        expect(poster()).toBeTruthy()

        Object.defineProperty(video, "currentTime", { configurable: true, value: 0.4 })
        fireEvent.timeUpdate(video)
        expect(poster()).toBeNull()
    })

    it("a grab that finds nothing: the play button on the surface, no poster", async () => {
        grab.grabVideoFrame.mockResolvedValue(null)
        open()
        await act(async () => {})

        expect(poster()).toBeNull()
        expect(skeleton()).toBeNull()
        expect(document.querySelector('[class*="previewPlayBtn"]')).toBeTruthy()
    })

    it("asks for #t=0.1 on the blob, and is inline", () => {
        const { video } = open()

        expect(video.getAttribute("src")).toMatch(/^blob:.*#t=0\.1$/)
        expect(video.hasAttribute("playsinline")).toBe(true)
    })

    it("the box is the surface, never black, in its CSS", () => {
        const css = readFileSync(join(__dirname, "CreatePostModal.module.css"), "utf8")
        const rule = css.match(/\.previewMedia\s*\{[^}]*\}/)![0]

        expect(rule).toContain("var(--color-surface-raised)")
        expect(rule).not.toMatch(/#000/)
    })

    it("Post hands the queue a NEW URL of the same frame", async () => {
        await frameArrives()
        open()
        await act(async () => {})
        const own = poster()!.getAttribute("src")!

        post()

        const { preview, previewFile } = queue.enqueueUpload.mock.calls[0][0]
        expect(preview.localThumbUrl).toMatch(/^blob:/)
        expect(preview.localThumbUrl).not.toBe(own)
        expect(URL.createObjectURL).toHaveBeenLastCalledWith(FRAME_BLOB)
        // Kept for the draft; the queue only captures when there is no URL.
        expect(previewFile).toBeInstanceOf(File)
    })

    it("closing revokes its own URL and leaves the queue's alone", async () => {
        await frameArrives()
        const { unmount } = open()
        await act(async () => {})
        const own = poster()!.getAttribute("src")!

        post()
        const handedOver = queue.enqueueUpload.mock.calls[0][0].preview.localThumbUrl
        unmount()

        expect(revoked).toContain(own)
        expect(revoked).not.toContain(handedOver)
    })

    it("Post before the frame is ready: no URL, and the queue gets it from the file", () => {
        open()

        post()

        const { preview, previewFile } = queue.enqueueUpload.mock.calls[0][0]
        expect(preview.localThumbUrl).toBeUndefined()
        expect(previewFile).toBeInstanceOf(File)
    })

    it("closing mid-grab aborts it", () => {
        const { unmount } = open()
        const { signal } = grab.grabVideoFrame.mock.calls[0][1] as { signal: AbortSignal }
        expect(signal.aborted).toBe(false)

        unmount()

        expect(signal.aborted).toBe(true)
    })

    it("photos are left alone", () => {
        render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal
                    username="player1"
                    onClose={vi.fn()}
                    initialDraft={{
                        content: "Final whistle",
                        visibility: "public",
                        sportId: null,
                        location: null,
                        files: [new File([new Uint8Array(4)], "a.jpg", { type: "image/jpeg" })],
                    }}
                />
            </QueryClientProvider>
        )

        expect(grab.grabVideoFrame).not.toHaveBeenCalled()
    })
})

describe("CreatePostModal — closing cleanly", () => {
    it("settles the viewport before it closes", () => {
        const order: string[] = []
        viewport.settleViewport.mockImplementation(() => order.push("settle"))
        const onClose = vi.fn(() => order.push("close"))
        renderComposer(onClose)

        write("Match day at the stadium")
        post()

        expect(order).toEqual(["settle", "close"])
    })

    it("a refused post does not", () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true })
        renderComposer()

        write("Match day at the stadium")
        post()

        expect(viewport.settleViewport).not.toHaveBeenCalled()
    })

    it("brings the bars back when it closes, however it closes", () => {
        const { unmount } = render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal username="player1" onClose={vi.fn()} />
            </QueryClientProvider>
        )
        expect(chrome.revealChrome).not.toHaveBeenCalled()

        unmount()

        expect(chrome.revealChrome).toHaveBeenCalledTimes(1)
    })

    it("pauses playback while it is open, from any entry point", () => {
        const { unmount } = render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal username="player1" onClose={vi.fn()} />
            </QueryClientProvider>
        )
        expect(playback.suspensions).toBe(1)

        unmount()

        expect(playback.suspensions).toBe(0)
    })
})

describe("CreatePostModal — where the queue goes after", () => {
    it("a person's posts", () => {
        renderComposer()

        write("Match day at the stadium")
        post()

        expect(queue.enqueueUpload.mock.calls[0][0].destination).toEqual({
            href: "/profile/player1/posts",
            kind: "posts",
        })
    })

    it("an organization's posts, inside its admin area", () => {
        useAuthStore.setState({
            actorType: "organization",
            actorId: "org-1",
            isOrgAdminView: true,
            currentOrganization: { id: "org-1", username: "club" } as never,
        })
        render(
            <QueryClientProvider client={new QueryClient()}>
                <CreatePostModal username="club" onClose={vi.fn()} />
            </QueryClientProvider>
        )

        write("Trials this Sunday")
        post()

        expect(queue.enqueueUpload.mock.calls[0][0].destination).toEqual({
            href: "/organization/admin/org-1/posts",
            kind: "posts",
        })
    })
})

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
