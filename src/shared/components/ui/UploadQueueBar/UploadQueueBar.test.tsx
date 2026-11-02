// @vitest-environment jsdom
/**
 * UploadQueueBar: one row per task of the ACTIVE actor, each saying where it
 * is and offering what can be done about it. The queue itself is mocked —
 * this is only what the bar draws and which action each button calls.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"

const queue = vi.hoisted(() => ({
    cancelUpload: vi.fn(),
    dismissUpload: vi.fn(),
    editUpload: vi.fn(),
    retryUpload: vi.fn(),
    retryUploadWithoutSound: vi.fn(),
}))
const router = vi.hoisted(() => ({ push: vi.fn() }))
const path = vi.hoisted(() => ({ current: "/home" }))

vi.mock("@/shared/upload/uploadQueue", () => ({
    ...queue,
    useActorKey: () => "user-1",
    useUploadQueueRuntime: () => {},
}))
vi.mock("next/navigation", () => ({
    usePathname: () => path.current,
    useRouter: () => router,
}))
vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({
        toPost: (id: string) => `/posts/${id}`,
        toProfile: (username: string) => `/profile/${username}`,
    }),
}))

import UploadQueueBar from "./UploadQueueBar"

let seq = 0
const task = (over: Partial<QueueTask> = {}): QueueTask => ({
    id: `t-${++seq}`,
    kind: "post",
    actorKey: "user-1",
    actor: { type: "user" },
    label: "Match day",
    preview: { mediaType: "image" },
    status: "uploading",
    progress: 0.45,
    run: async () => ({ kind: "done", result: {} }),
    createdAt: seq,
    ...over,
})

const show = (...rows: QueueTask[]) => {
    act(() => useUploadQueueStore.setState({ tasks: rows }))
    return render(<UploadQueueBar />)
}

const button = (name: string) => screen.getByRole("button", { name })

/** The status lines as drawn (the live region repeats some of them). */
const visibleLines = () =>
    Array.from(document.querySelectorAll('p[aria-hidden="true"]')).map((p) => p.textContent)

beforeEach(() => {
    for (const mock of Object.values(queue)) mock.mockReset()
    router.push.mockReset()
    path.current = "/home"
})

afterEach(() => {
    cleanup()
    useUploadQueueStore.setState({ tasks: [] })
})

describe("status lines", () => {
    it.each([
        [task({ status: "preparing" }), "Preparing…"],
        [task({ status: "uploading", progress: 0.45 }), "Posting… 45%"],
        [task({ kind: "highlight", status: "uploading", progress: 0.3 }), "Adding highlight… 30%"],
        [
            task({ status: "processing", preview: { mediaType: "video" } }),
            "Processing video… you can leave the app",
        ],
        [task({ status: "processing" }), "Processing… you can leave the app"],
        [task({ status: "publishing" }), "Almost done…"],
        [task({ status: "done", result: { postId: "p-1" } }), "Posted"],
        [task({ kind: "highlight", status: "done", result: { highlightId: "h-1" } }), "Highlight added"],
        [
            task({ status: "failed", error: { message: "Upload failed (UPLOAD_NETWORK)", canRetry: true } }),
            "Upload failed (UPLOAD_NETWORK)",
        ],
    ])("%#: %s", (row, line) => {
        show(row)
        expect(visibleLines()).toEqual([line])
    })

    it("shows the caption under a row in progress, and the retry state instead while a PUT starts over", () => {
        show(task({ id: "a", createdAt: 1 }), task({ id: "b", createdAt: 2, retryLabel: "Retrying… (2/4)" }))
        expect(screen.getByText("Match day")).toBeTruthy()
        expect(screen.getByText("Retrying… (2/4)")).toBeTruthy()
    })
})

describe("actions", () => {
    it("cancels a running upload only after asking", async () => {
        const row = task({ id: "run-1", status: "uploading" })
        show(row)

        fireEvent.click(button("Cancel post"))
        const dialog = screen.getByRole("alertdialog")
        expect(queue.cancelUpload).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel post" }))

        // The dialog answers through history (back-to-close): async.
        await waitFor(() => expect(queue.cancelUpload).toHaveBeenCalledWith("run-1"))
    })

    it("offers no cancel while publishing — the create is already in flight", () => {
        show(task({ status: "publishing" }))
        expect(screen.queryByRole("button", { name: "Cancel post" })).toBeNull()
    })

    it("a failure offers Retry and Discard", () => {
        show(task({ id: "f-1", status: "failed", error: { message: "No.", canRetry: true } }))

        fireEvent.click(button("Retry"))
        fireEvent.click(button("Discard"))

        expect(queue.retryUpload).toHaveBeenCalledWith("f-1")
        expect(queue.dismissUpload).toHaveBeenCalledWith("f-1")
        expect(screen.queryByRole("button", { name: "Post without sound" })).toBeNull()
    })

    it("a lost sound offers to post (or add) without it", () => {
        show(
            task({
                id: "s-1",
                status: "failed",
                error: { message: "No sound.", canRetry: true, canRetryWithoutSound: true },
            }),
            task({
                id: "s-2",
                kind: "highlight",
                status: "failed",
                error: { message: "No sound either.", canRetry: true, canRetryWithoutSound: true },
            })
        )

        fireEvent.click(button("Post without sound"))
        fireEvent.click(button("Add without sound"))

        expect(queue.retryUploadWithoutSound).toHaveBeenCalledWith("s-1")
        expect(queue.retryUploadWithoutSound).toHaveBeenCalledWith("s-2")
    })

    it("a failure restored after a reload can only be discarded", () => {
        show(task({ status: "failed", run: undefined, error: { message: "Gone.", canRetry: false } }))

        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
        expect(button("Discard")).toBeTruthy()
    })

    it("View opens the post, and the row goes", () => {
        show(task({ id: "d-1", status: "done", result: { postId: "p-9" } }))

        fireEvent.click(button("View"))

        expect(router.push).toHaveBeenCalledWith("/posts/p-9")
        expect(queue.dismissUpload).toHaveBeenCalledWith("d-1")
    })
})

describe("what is shown", () => {
    it("only the active actor's tasks, newest first, at most three", () => {
        show(
            task({ label: "one", createdAt: 1 }),
            task({ label: "two", createdAt: 2 }),
            task({ label: "three", createdAt: 3 }),
            task({ label: "four", createdAt: 4 }),
            task({ label: "the club's", actorKey: "org-1", createdAt: 5 })
        )

        const labels = screen.getAllByText(/^(one|two|three|four|the club's)$/).map((n) => n.textContent)
        expect(labels).toEqual(["four", "three", "two"])
    })

    it("nothing on a chat thread", () => {
        path.current = "/messages/chat/c-1"
        const { container } = show(task())
        expect(container.innerHTML).toBe("")
    })
})

describe("for a screen reader (F7)", () => {
    it("announces the status, not every 5%; the count is on the progressbar", () => {
        const row = task({ id: "p-1", status: "uploading", progress: 0.45 })
        show(row)

        expect(screen.getByRole("status").textContent).toBe("Posting…")
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("45")

        act(() => useUploadQueueStore.getState().patch("p-1", { progress: 0.5 }))
        expect(screen.getByRole("status").textContent).toBe("Posting…")
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50")

        act(() => useUploadQueueStore.getState().patch("p-1", { status: "processing", preview: { mediaType: "video" } }))
        expect(screen.getByRole("status").textContent).toBe("Processing video… you can leave the app")
        // The server is working: indeterminate, not a number.
        expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false)
    })

    it("the bar itself is not a live region", () => {
        show(task())
        expect(document.querySelector('[aria-live]:not([role="status"])')).toBeNull()
    })
})

describe("Edit (F5)", () => {
    it("a post that cannot be retried offers Edit instead of Retry", () => {
        show(
            task({
                id: "e-1",
                status: "failed",
                error: { message: "Video must be under 5 minutes", canRetry: false },
                onEdit: vi.fn(),
            })
        )

        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
        fireEvent.click(button("Edit"))
        expect(queue.editUpload).toHaveBeenCalledWith("e-1")
    })

    it("no Edit while a retry can still help", () => {
        show(task({ status: "failed", error: { message: "Offline.", canRetry: true }, onEdit: vi.fn() }))
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
        expect(button("Retry")).toBeTruthy()
    })
})
