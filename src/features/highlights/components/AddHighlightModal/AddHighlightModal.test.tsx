// @vitest-environment jsdom
/**
 * The add-highlight modal no longer blocks: pick → title → Add queues the clip
 * and closes. The checks a player can act on stay here — the format, the 90 s
 * cap, and a full rail (the rail the screen loaded, plus clips still on their
 * way up).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const queue = vi.hoisted(() => ({
    enqueueUpload: vi.fn(),
    currentActorKey: vi.fn(() => "user-1"),
}))
const probe = vi.hoisted(() => ({ meta: { durationSec: 24, width: 720, height: 1280 } }))
const viewport = vi.hoisted(() => ({ settleViewport: vi.fn() }))
const grab = vi.hoisted(() => ({ grabVideoFrame: vi.fn(), frameToJpeg: vi.fn() }))

vi.mock("@/shared/upload/uploadQueue", () => queue)
vi.mock("@/shared/utils/settleViewport", () => viewport)
// The real Icon loads its SVG data on a timer that can fire after jsdom is
// torn down ("window is not defined"); a plain span draws nothing anyway.
vi.mock("@iconify/react", () => ({ Icon: () => null }))
vi.mock("@/shared/services/mediaCapabilities", () => ({
    useMediaCapabilities: () => ({ server_processing: false }),
}))
vi.mock("@/features/messages/services/chatUpload.service", () => ({
    UPLOAD_CANCELLED: "upload_cancelled",
    getVideoMeta: vi.fn(async () => probe.meta),
}))
// What the modal does with the frame, not how it is grabbed: videoFrame.test.ts.
vi.mock("@/shared/services/videoFrame", () => ({
    grabVideoFrame: grab.grabVideoFrame,
    frameToJpeg: grab.frameToJpeg,
}))

import { useAuthStore } from "@/store/auth.store"
import { useUploadQueueStore } from "@/store/uploadQueue.store"
import AddHighlightModal from "./AddHighlightModal"

const clip = (name = "goal.mp4", type = "video/mp4") => new File([new Uint8Array(4)], name, { type })

const pick = async (file: File) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
        fireEvent.change(input, { target: { files: [file] } })
    })
}

beforeEach(() => {
    queue.enqueueUpload.mockReset()
    viewport.settleViewport.mockReset()
    useAuthStore.setState({ user: { id: "user-1", username: "player1" } as never })
    probe.meta = { durationSec: 24, width: 720, height: 1280 }
    URL.createObjectURL = vi.fn(() => "blob:preview")
    URL.revokeObjectURL = vi.fn()
    useUploadQueueStore.setState({ tasks: [] })
    grab.grabVideoFrame.mockReset()
    // Unless a test says otherwise, it never comes back.
    grab.grabVideoFrame.mockImplementation(() => new Promise(() => {}))
    grab.frameToJpeg.mockReset()
})

afterEach(cleanup)

describe("AddHighlightModal — the preview", () => {
    const FRAME_BLOB = new Blob(["frame"], { type: "image/jpeg" })

    const frameArrives = () => {
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

    /** A distinct URL per call, so whose is whose can be told apart. */
    const numberedUrls = () => {
        let made = 0
        URL.createObjectURL = vi.fn(() => `blob:${++made}`)
    }

    it("while grabbing: the skeleton and the small spinner", async () => {
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)
        await pick(clip())

        expect(skeleton()).toBeTruthy()
        await act(() => new Promise((resolve) => setTimeout(resolve, 450)))
        expect(document.querySelector("[data-media-loading]")!.getAttribute("data-media-loading")).toBe("sm")
    })

    it("then the grabbed frame as its poster, over the #t=0.1 source", async () => {
        frameArrives()
        numberedUrls()
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)
        await pick(clip())
        await act(async () => {})

        expect(poster()).toBeTruthy()
        expect(skeleton()).toBeNull()
        expect(document.querySelector("video")!.getAttribute("src")).toMatch(/#t=0\.1$/)
    })

    it("the poster stays until it is played and a frame paints", async () => {
        frameArrives()
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)
        await pick(clip())
        await act(async () => {})
        const video = document.querySelector("video")!
        Object.defineProperty(video, "paused", { configurable: true, value: false })

        Object.defineProperty(video, "currentTime", { configurable: true, value: 0.1 })
        fireEvent.playing(video)
        expect(poster()).toBeTruthy()

        Object.defineProperty(video, "currentTime", { configurable: true, value: 0.4 })
        fireEvent.timeUpdate(video)
        expect(poster()).toBeNull()
    })

    it("Add hands the queue a NEW URL of the same frame", async () => {
        frameArrives()
        numberedUrls()
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)
        await pick(clip())
        await act(async () => {})
        const own = poster()!.getAttribute("src")

        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        const { preview } = queue.enqueueUpload.mock.calls[0][0]
        expect(preview.localThumbUrl).toMatch(/^blob:/)
        expect(preview.localThumbUrl).not.toBe(own)
        expect(URL.createObjectURL).toHaveBeenLastCalledWith(FRAME_BLOB)
    })

    it("Add before the frame is ready: no URL, and the queue gets it from the file", async () => {
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)
        await pick(clip())

        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        const { preview, previewFile } = queue.enqueueUpload.mock.calls[0][0]
        expect(preview.localThumbUrl).toBeUndefined()
        expect(previewFile).toBeInstanceOf(File)
    })

    it("a refused clip makes no URL for a queue that will never own it", async () => {
        frameArrives()
        numberedUrls()
        render(<AddHighlightModal existingCount={10} onClose={vi.fn()} />)
        await pick(clip())
        await act(async () => {})
        const calls = vi.mocked(URL.createObjectURL).mock.calls.length

        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        expect(queue.enqueueUpload).not.toHaveBeenCalled()
        expect(vi.mocked(URL.createObjectURL).mock.calls).toHaveLength(calls)
    })

    it("the box is the surface, never black, in its CSS", () => {
        const css = readFileSync(join(__dirname, "AddHighlightModal.module.css"), "utf8")
        for (const selector of [".preview", ".previewVideo"]) {
            const rule = css.match(new RegExp(`\\${selector}\\s*\\{[^}]*\\}`))![0]
            expect(rule).toContain("var(--color-surface-raised)")
            expect(rule).not.toMatch(/#000/)
        }
    })
})

describe("AddHighlightModal", () => {
    it("Add queues the clip and closes", async () => {
        const onClose = vi.fn()
        render(<AddHighlightModal existingCount={3} onClose={onClose} />)

        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Free kick" } })
        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        expect(queue.enqueueUpload).toHaveBeenCalledTimes(1)
        expect(queue.enqueueUpload.mock.calls[0][0]).toMatchObject({
            kind: "highlight",
            label: "Free kick",
            preview: { mediaType: "video" },
        })
        expect(onClose).toHaveBeenCalledTimes(1)
        // No blocking bar inside the modal any more.
        expect(screen.queryByText(/Uploading…/)).toBeNull()
    })

    it("goes to the profile when it is up, the rail being at the top of it", async () => {
        render(<AddHighlightModal existingCount={3} onClose={vi.fn()} />)

        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        expect(queue.enqueueUpload.mock.calls[0][0].destination).toEqual({
            href: "/profile/player1",
            kind: "profile",
        })
    })

    it("settles the viewport before it closes, and not on a refusal", async () => {
        const order: string[] = []
        viewport.settleViewport.mockImplementation(() => order.push("settle"))
        const { unmount } = render(
            <AddHighlightModal existingCount={3} onClose={() => order.push("close")} />
        )

        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Add" }))
        expect(order).toEqual(["settle", "close"])
        unmount()

        viewport.settleViewport.mockClear()
        render(<AddHighlightModal existingCount={10} onClose={vi.fn()} />)
        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Add" }))
        expect(viewport.settleViewport).not.toHaveBeenCalled()
    })

    it("a full rail is refused here, before any upload", async () => {
        const onClose = vi.fn()
        render(<AddHighlightModal existingCount={10} onClose={onClose} />)

        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        expect(screen.getByRole("alert").textContent).toContain("You already have 10 highlights")
        expect(queue.enqueueUpload).not.toHaveBeenCalled()
        expect(onClose).not.toHaveBeenCalled()
    })

    it("counts the clips still on their way up", async () => {
        useUploadQueueStore.setState({
            tasks: [
                {
                    id: "t-1",
                    kind: "highlight",
                    actorKey: "user-1",
                    actor: { type: "user" },
                    label: "",
                    preview: { mediaType: "video" },
                    status: "processing",
                    progress: 1,
                    createdAt: 1,
                },
            ],
        })
        render(<AddHighlightModal existingCount={9} onClose={vi.fn()} />)

        await pick(clip())
        await waitFor(() => expect(screen.getByText("goal.mp4")).toBeTruthy())
        fireEvent.click(screen.getByRole("button", { name: "Add" }))

        expect(queue.enqueueUpload).not.toHaveBeenCalled()
    })

    it("refuses a clip over 90 s at pick time", async () => {
        probe.meta = { durationSec: 140, width: 720, height: 1280 }
        render(<AddHighlightModal existingCount={0} onClose={vi.fn()} />)

        await pick(clip())

        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toContain("at most 90 seconds")
        )
    })

    it("refuses an .mkv with the server off", async () => {
        render(<AddHighlightModal existingCount={0} onClose={vi.fn()} />)

        await pick(clip("match.mkv", "video/x-matroska"))

        expect(screen.getByRole("alert").textContent).toContain("Videos must be MP4, MOV or WebM.")
    })
})
