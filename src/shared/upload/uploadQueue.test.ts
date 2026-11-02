// @vitest-environment jsdom
/**
 * The background upload queue: a 200/201 finishes the task, a 202 holds it
 * until the server publishes (publication_updated), a failure keeps the task
 * for Retry, the leave-page prompt only guards files still on the device, and
 * a reload restores the server's half from GET /media/publications — and,
 * since the fix round: a failure offers Retry only when it can help (a post
 * offers Edit otherwise), a video waits for its preview frame, a restore asks
 * only for what it shows and never duplicates a 202, and with server
 * processing off nothing asks /media/* at all.
 *
 * The queue keeps module-level state (the FIFO, the running task), so every
 * test imports a fresh copy.
 */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { AxiosError } from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PendingPublication } from "@/shared/services/publications"

const mocks = vi.hoisted(() => ({
    invalidateQueries: vi.fn(),
    invalidatePostLists: vi.fn(),
    fetchPublications: vi.fn(),
    cancelPublication: vi.fn(),
    dismissPublication: vi.fn(),
    captureVideoThumbnail: vi.fn(),
}))
const capabilities = vi.hoisted(() => ({ serverProcessing: true }))

vi.mock("@/core/react-query/QueryProvider", () => ({
    queryClient: { invalidateQueries: mocks.invalidateQueries },
}))
vi.mock("@/features/posts/hooks/usePostMutations", () => ({
    invalidatePostLists: mocks.invalidatePostLists,
}))
vi.mock("@/features/highlights/hooks/useHighlights", () => ({
    highlightKeys: { all: ["highlights"] },
}))
vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
    profileKeys: { me: () => ["profile", "me"], user: (u: string) => ["profile", "user", u] },
}))
vi.mock("@/features/messages/services/chatUpload.service", () => ({
    captureVideoThumbnail: mocks.captureVideoThumbnail,
}))
vi.mock("@/shared/services/mediaCapabilities", () => ({
    ensureMediaCapabilities: vi.fn(async () => ({ server_processing: capabilities.serverProcessing })),
}))
vi.mock("@/shared/hooks/useScreenWakeLock", () => ({
    holdScreenWakeLock: () => () => {},
}))
vi.mock("@/shared/services/publications", () => ({
    fetchPublications: mocks.fetchPublications,
    cancelPublication: mocks.cancelPublication,
    dismissPublication: mocks.dismissPublication,
}))

type Queue = typeof import("./uploadQueue")
type Store = typeof import("@/store/uploadQueue.store")
type Bus = typeof import("@/core/ws/realtimeBus")

let queue: Queue
let store: Store["useUploadQueueStore"]
let bus: Bus["realtimeBus"]
let auth: typeof import("@/store/auth.store")
// From the same fresh module graph as the queue: instanceof must match.
let UploadRefusal: typeof import("./uploadRefusal").UploadRefusal

const publication = (over: Partial<PendingPublication> = {}): PendingPublication =>
    ({
        id: "pub-1",
        target: "post",
        status: "processing",
        error_code: null,
        error_message: null,
        result_id: null,
        created_at: new Date().toISOString(),
        published_at: null,
        preview: { media_type: "video", thumbnail_url: null, content: "Match day" },
        jobs: [],
        ...over,
    }) as PendingPublication

const tasks = () => store.getState().tasks
const only = () => {
    expect(tasks()).toHaveLength(1)
    return tasks()[0]
}

beforeEach(async () => {
    vi.resetModules()
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.fetchPublications.mockResolvedValue([])
    mocks.dismissPublication.mockResolvedValue({})
    mocks.captureVideoThumbnail.mockResolvedValue("")
    capabilities.serverProcessing = true

    auth = await import("@/store/auth.store")
    auth.useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
    })

    queue = await import("./uploadQueue")
    store = (await import("@/store/uploadQueue.store")).useUploadQueueStore
    bus = (await import("@/core/ws/realtimeBus")).realtimeBus
    UploadRefusal = (await import("./uploadRefusal")).UploadRefusal
})

// A mounted runtime keeps its listeners (beforeunload, the bus) until unmounted.
afterEach(cleanup)

const enqueue = (run: Parameters<Queue["enqueueUpload"]>[0]["run"]) =>
    queue.enqueueUpload({
        kind: "post",
        label: "Match day",
        preview: { mediaType: "none" },
        run,
    })

describe("a task's run", () => {
    it("200/201 → done, with the post id, and the feeds refreshed", async () => {
        enqueue(async (ctx) => {
            ctx.setStatus("publishing")
            return { kind: "done", result: { postId: "post-9" } }
        })

        await waitFor(() => expect(only().status).toBe("done"))
        expect(only().result).toEqual({ postId: "post-9" })
        expect(only().actorKey).toBe("user-1")
        expect(mocks.invalidatePostLists).toHaveBeenCalledTimes(1)
    })

    it("202 → processing, then done when the server says it published", async () => {
        renderHook(() => queue.useUploadQueueRuntime())
        enqueue(async () => ({ kind: "processing", publication: publication() }))

        await waitFor(() => expect(only().status).toBe("processing"))
        expect(only().publicationId).toBe("pub-1")

        act(() => {
            bus.emit({
                notification_type: "publication_updated",
                publication: publication({ status: "published", result_id: "post-7" }),
            })
        })

        expect(only().status).toBe("done")
        expect(only().result).toEqual({ postId: "post-7" })
    })

    it("202 → failed when the server could not publish it, keeping Retry", async () => {
        renderHook(() => queue.useUploadQueueRuntime())
        enqueue(async () => ({ kind: "processing", publication: publication() }))
        await waitFor(() => expect(only().status).toBe("processing"))

        act(() => {
            bus.emit({
                notification_type: "publication_updated",
                publication: publication({
                    status: "failed",
                    // A worker that timed out: worth another go.
                    error_code: "PROCESSING_TIMEOUT",
                    error_message: "This video couldn't be converted.",
                }),
            })
        })

        expect(only().status).toBe("failed")
        expect(only().error).toMatchObject({
            message: "This video couldn't be converted.",
            canRetry: true,
        })
    })

    it("a failure keeps the task, and Retry runs it again", async () => {
        const run = vi
            .fn()
            .mockRejectedValueOnce(new Error("Upload failed (UPLOAD_NETWORK)"))
            .mockResolvedValueOnce({ kind: "done", result: { postId: "post-2" } })
        const id = enqueue(run)

        await waitFor(() => expect(only().status).toBe("failed"))
        expect(only().error).toMatchObject({
            message: "Upload failed (UPLOAD_NETWORK)",
            canRetry: true,
            canRetryWithoutSound: false,
        })

        queue.retryUpload(id)

        await waitFor(() => expect(only().status).toBe("done"))
        expect(run).toHaveBeenCalledTimes(2)
    })

    it("a cancel removes the task without calling it a failure", async () => {
        const id = enqueue(
            (ctx) =>
                new Promise((_, reject) => {
                    ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason))
                })
        )
        await waitFor(() => expect(only().status).toBe("preparing"))

        void queue.cancelUpload(id)

        await waitFor(() => expect(tasks()).toHaveLength(0))
    })
})

describe("the leave-page prompt", () => {
    const leave = () => {
        const event = new Event("beforeunload", { cancelable: true })
        window.dispatchEvent(event)
        return event.defaultPrevented
    }

    const add = (status: "uploading" | "processing") =>
        store.getState().add({
            id: "t-1",
            kind: "post",
            actorKey: "user-1",
            label: "",
            preview: { mediaType: "none" },
            actor: { type: "user" },
            status,
            progress: 0.5,
            createdAt: Date.now(),
        })

    it("asks while the files are still on the device", () => {
        const { rerender } = renderHook(() => queue.useUploadQueueRuntime())
        act(() => add("uploading"))
        rerender()

        expect(leave()).toBe(true)
    })

    it("does not ask once the server holds the post", () => {
        const { rerender } = renderHook(() => queue.useUploadQueueRuntime())
        act(() => add("processing"))
        rerender()

        expect(leave()).toBe(false)
    })
})

describe("after a reload", () => {
    it("shows what the server is still holding, or failed to publish", async () => {
        mocks.fetchPublications.mockResolvedValue([
            publication({ id: "pub-held" }),
            publication({
                id: "pub-failed",
                status: "failed",
                error_message: "This photo couldn't be converted.",
                preview: { media_type: "image", thumbnail_url: "https://m/t.jpg", content: "Nets" },
            }),
        ])

        renderHook(() => queue.useUploadQueueRuntime())

        await waitFor(() => expect(tasks()).toHaveLength(2))
        // Only what it shows: the server answers the newest 20, and
        // published rows would crowd an older failure out.
        expect(mocks.fetchPublications).toHaveBeenCalledWith(["processing", "failed"], { type: "user" })

        const held = tasks().find((t) => t.publicationId === "pub-held")
        expect(held).toMatchObject({ status: "processing", label: "Match day", actorKey: "user-1" })
        expect(held?.run).toBeUndefined()

        const failed = tasks().find((t) => t.publicationId === "pub-failed")
        expect(failed).toMatchObject({
            status: "failed",
            label: "Nets",
            preview: { mediaType: "image", localThumbUrl: "https://m/t.jpg" },
            error: { message: "This photo couldn't be converted.", canRetry: false },
        })
    })

    it("dismissing a restored failure tells the server", async () => {
        mocks.fetchPublications.mockResolvedValue([
            publication({ id: "pub-failed", status: "failed", error_message: "No." }),
        ])
        renderHook(() => queue.useUploadQueueRuntime())
        await waitFor(() => expect(tasks()).toHaveLength(1))

        queue.dismissUpload(only().id)

        expect(mocks.dismissPublication).toHaveBeenCalledWith("pub-failed", { type: "user" })
        expect(tasks()).toHaveLength(0)
    })
})

describe("restore and the server's half (F3, F6)", () => {
    it("the poll asks for published too, to notice a post that went live", async () => {
        renderHook(() => queue.useUploadQueueRuntime())
        enqueue(async () => ({ kind: "processing", publication: publication() }))
        await waitFor(() => expect(only().status).toBe("processing"))
        mocks.fetchPublications.mockClear()

        act(() => bus.emit({ notification_type: "realtime.open" }))

        await waitFor(() => expect(mocks.fetchPublications).toHaveBeenCalled())
        expect(mocks.fetchPublications.mock.calls[0][0]).toEqual(["processing", "failed", "published"])
    })

    it("a 202 removes the restored row of the same publication", async () => {
        mocks.fetchPublications.mockResolvedValue([publication({ id: "pub-1" })])
        renderHook(() => queue.useUploadQueueRuntime())
        await waitFor(() => expect(tasks()).toHaveLength(1))
        expect(only().run).toBeUndefined()

        enqueue(async () => ({ kind: "processing", publication: publication({ id: "pub-1" }) }))

        await waitFor(() => expect(tasks().filter((t) => t.run)).toHaveLength(1))
        expect(only()).toMatchObject({ publicationId: "pub-1", status: "processing" })
        expect(only().run).toBeDefined()
    })

    it("no restore while a create of that actor is in flight", async () => {
        store.getState().add({
            id: "busy",
            kind: "post",
            actorKey: "user-1",
            actor: { type: "user" },
            label: "",
            preview: { mediaType: "none" },
            status: "publishing",
            progress: 1,
            createdAt: 1,
        })

        renderHook(() => queue.useUploadQueueRuntime())
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(mocks.fetchPublications).not.toHaveBeenCalled()
    })

    it("with server processing off: no /media/publications on mount or account switch", async () => {
        capabilities.serverProcessing = false
        renderHook(() => queue.useUploadQueueRuntime())
        await new Promise((resolve) => setTimeout(resolve, 20))

        act(() => {
            auth.useAuthStore.setState({ actorType: "organization", actorId: "org-1" })
        })
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(mocks.fetchPublications).not.toHaveBeenCalled()
    })
})

describe("pinned to its account (F1)", () => {
    it("captures the actor at enqueue and runs with it after a switch", async () => {
        auth.useAuthStore.setState({ actorType: "organization", actorId: "org-1" })
        let seen: unknown = null
        enqueue(async (ctx) => {
            seen = ctx.actor
            return { kind: "done", result: { postId: "p" } }
        })
        auth.useAuthStore.setState({ actorType: "user", actorId: null })

        await waitFor(() => expect(only().status).toBe("done"))
        expect(seen).toEqual({ type: "organization", id: "org-1" })
        expect(only()).toMatchObject({ actorKey: "org-1", actor: { type: "organization", id: "org-1" } })
    })

    it("cancels and dismisses on the server as the task's account", async () => {
        renderHook(() => queue.useUploadQueueRuntime())
        auth.useAuthStore.setState({ actorType: "organization", actorId: "org-1" })
        const id = enqueue(async () => ({ kind: "processing", publication: publication() }))
        await waitFor(() => expect(only().status).toBe("processing"))
        auth.useAuthStore.setState({ actorType: "user", actorId: null })
        mocks.cancelPublication.mockResolvedValue({})

        await queue.cancelUpload(id)

        expect(mocks.cancelPublication).toHaveBeenCalledWith("pub-1", { type: "organization", id: "org-1" })
    })
})

describe("a video waits for its preview (F4)", () => {
    it("starts only once the preview frame has settled", async () => {
        let frame: (url: string) => void = () => {}
        mocks.captureVideoThumbnail.mockReturnValue(new Promise((resolve) => (frame = resolve)))
        const run = vi.fn(async () => ({ kind: "done" as const, result: {} }))

        queue.enqueueUpload({
            kind: "post",
            label: "",
            preview: { mediaType: "video" },
            previewFile: new File([new Uint8Array(4)], "clip.mov", { type: "video/quicktime" }),
            run,
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(run).not.toHaveBeenCalled()

        frame("blob:frame")
        await waitFor(() => expect(run).toHaveBeenCalledTimes(1))
        expect(only().preview.localThumbUrl).toBe("blob:frame")
    })

    it("a cancel while waiting drops it; it never starts", async () => {
        let frame: (url: string) => void = () => {}
        mocks.captureVideoThumbnail.mockReturnValue(new Promise((resolve) => (frame = resolve)))
        const run = vi.fn()
        const id = queue.enqueueUpload({
            kind: "post",
            label: "",
            preview: { mediaType: "video" },
            previewFile: new File([new Uint8Array(4)], "clip.mov", { type: "video/quicktime" }),
            run,
        })

        await queue.cancelUpload(id)
        frame("")
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(tasks()).toHaveLength(0)
        expect(run).not.toHaveBeenCalled()
    })
})

describe("Retry only when it can help (F5)", () => {
    const refused = (status: number, message: string) =>
        new AxiosError("refused", "ERR_BAD_REQUEST", undefined, null, {
            status,
            statusText: "",
            headers: {},
            config: { headers: {} } as never,
            data: { message },
        })

    it("a refusal the pipeline made itself: no Retry", async () => {
        enqueue(async () => {
            throw new UploadRefusal("Video must be under 5 minutes")
        })
        await waitFor(() => expect(only().status).toBe("failed"))
        expect(only().error).toMatchObject({ message: "Video must be under 5 minutes", canRetry: false })
    })

    it("a 4xx (\"already used\"): no Retry; a 5xx: Retry", async () => {
        enqueue(async () => {
            throw refused(400, "This upload is already used.")
        })
        await waitFor(() => expect(only().status).toBe("failed"))
        expect(only().error).toMatchObject({ message: "This upload is already used.", canRetry: false })

        queue.dismissUpload(only().id)
        enqueue(async () => {
            throw refused(503, "Service unavailable")
        })
        await waitFor(() => expect(only().status).toBe("failed"))
        expect(only().error?.canRetry).toBe(true)
    })

    it("a full highlight rail: the server's sentence, no Retry", async () => {
        queue.enqueueUpload({
            kind: "highlight",
            label: "",
            preview: { mediaType: "none" },
            run: async () => {
                throw refused(400, "You already have 10 highlights. Delete one to add another.")
            },
        })
        await waitFor(() => expect(only().status).toBe("failed"))
        expect(only().error).toMatchObject({
            message: "You already have 10 highlights. Delete one to add another.",
            canRetry: false,
        })
    })

    it("a held post the server failed for good: no Retry", async () => {
        renderHook(() => queue.useUploadQueueRuntime())
        enqueue(async () => ({ kind: "processing", publication: publication() }))
        await waitFor(() => expect(only().status).toBe("processing"))

        act(() => {
            bus.emit({
                notification_type: "publication_updated",
                publication: publication({
                    status: "failed",
                    error_code: "VIDEO_TOO_LONG",
                    error_message: "Videos can be at most 5:00 long",
                }),
            })
        })

        expect(only().error).toMatchObject({ canRetry: false })
    })

    it("Edit reopens the draft and drops the failed row", async () => {
        const onEdit = vi.fn()
        queue.enqueueUpload({
            kind: "post",
            label: "",
            preview: { mediaType: "none" },
            run: async () => {
                throw new UploadRefusal("Video must be under 5 minutes")
            },
            onEdit,
        })
        await waitFor(() => expect(only().status).toBe("failed"))

        queue.editUpload(only().id)

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(tasks()).toHaveLength(0)
    })
})
