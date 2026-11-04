// @vitest-environment jsdom
/**
 * UploadQueueBar: the minimized upload, one pill. What it says, when it is
 * hidden, whose tasks it shows, and where a tap goes. The queue itself is mocked;
 * a task's actions are UploadScreen's now.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"

const queue = vi.hoisted(() => ({ dismissUpload: vi.fn() }))
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
vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
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

const pill = () => screen.queryByRole("button")
const store = () => useUploadQueueStore.getState()

beforeEach(() => {
    queue.dismissUpload.mockReset()
    router.push.mockReset()
    path.current = "/home"
    useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
        currentOrganization: null,
    })
})

afterEach(() => {
    cleanup()
    useUploadQueueStore.setState({ tasks: [], view: "minimized", focusedTaskId: null, opening: null })
})

describe("the label", () => {
    it.each([
        ["preparing", { status: "preparing", progress: 0 }, "Posting 0%"],
        ["uploading", { status: "uploading", progress: 0.45 }, "Posting 45%"],
        ["a highlight", { kind: "highlight", status: "uploading", progress: 0.3 }, "Adding 30%"],
        ["processing", { status: "processing" }, "Processing…"],
        ["publishing", { status: "publishing" }, "Almost done…"],
        ["done", { status: "done", destination: { href: "/x", kind: "posts" } }, "Posted · View"],
        [
            "a highlight, done",
            { kind: "highlight", status: "done", destination: { href: "/x", kind: "profile" } },
            "Highlight added · View",
        ],
        ["failed", { status: "failed", error: { message: "No.", canRetry: true } }, "Upload failed · Tap to fix"],
    ] as Array<[string, Partial<QueueTask>, string]>)("%s", (_name, over, label) => {
        show(task(over))
        expect(pill()!.textContent).toContain(label)
    })

    it("a retry says so instead", () => {
        show(task({ retryLabel: "Retrying… (2/4)" }))
        expect(pill()!.textContent).toContain("Retrying… (2/4)")
    })

    it("a restored task with nowhere of its own works one out from the active account", () => {
        show(task({ status: "done" }))
        expect(pill()!.textContent).toContain("Posted · View")

        fireEvent.click(pill()!)
        expect(router.push).toHaveBeenCalledWith("/profile/player1/posts")
    })

    it("+N when others are waiting, and it speaks for one", () => {
        show(task({ id: "a" }), task({ id: "b", status: "preparing" }), task({ id: "c", status: "preparing" }))

        expect(screen.getByText("+2")).toBeTruthy()
        expect(screen.getAllByRole("button")).toHaveLength(1)
    })

    it("a finished task is not counted as waiting; one still moving behind it is", () => {
        const done = (id: string) => task({ id, status: "done", destination: { href: "/x", kind: "posts" } })
        const first = show(done("a"), done("b"))
        expect(screen.queryByText("+1")).toBeNull()
        first.unmount()

        show(done("c"), task({ id: "d" }))
        expect(screen.getByText("+1")).toBeTruthy()
    })

    it("speaks for the failure over the one still moving, and 'Posted' over both", () => {
        const failure = task({ status: "failed", error: { message: "No.", canRetry: true } })
        const moving = task({ status: "uploading" })
        const { unmount } = show(moving, failure)
        expect(pill()!.textContent).toContain("Upload failed")
        unmount()

        show(moving, failure, task({ status: "done", destination: { href: "/x", kind: "posts" } }))
        expect(pill()!.textContent).toContain("Posted · View")
    })

    it("draws the thumbnail, or an icon when there is none", () => {
        const { unmount } = show(task({ preview: { mediaType: "video", localThumbUrl: "blob:thumb" } }))
        expect(document.querySelector('img[src="blob:thumb"]')).toBeTruthy()
        unmount()

        show(task({ preview: { mediaType: "video" } }))
        expect(document.querySelector('[data-icon="mdi:filmstrip"]')).toBeTruthy()
    })
})

describe("where a tap goes", () => {
    it("opens the screen on that task", () => {
        show(task({ id: "up-1" }))

        fireEvent.click(pill()!)

        expect(store().view).toBe("expanded")
        expect(store().focusedTaskId).toBe("up-1")
        expect(router.push).not.toHaveBeenCalled()
    })

    it("a failure opens it too: that is where Retry is", () => {
        show(task({ id: "f-1", status: "failed", error: { message: "No.", canRetry: true } }))

        fireEvent.click(pill()!)

        expect(store().focusedTaskId).toBe("f-1")
    })

    it("View goes to the destination, and the task goes", () => {
        show(task({ id: "d-1", status: "done", destination: { href: "/profile/x/posts", kind: "posts" } }))

        fireEvent.click(pill()!)

        expect(router.push).toHaveBeenCalledWith("/profile/x/posts")
        expect(queue.dismissUpload).toHaveBeenCalledWith("d-1")
        expect(store().view).toBe("minimized")
    })

    it("View on the page it is already on goes nowhere", () => {
        path.current = "/profile/x/posts"
        show(task({ id: "d-1", status: "done", destination: { href: "/profile/x/posts", kind: "posts" } }))

        fireEvent.click(pill()!)

        expect(router.push).not.toHaveBeenCalled()
        expect(queue.dismissUpload).toHaveBeenCalledWith("d-1")
    })

    it("no row actions on the pill any more", () => {
        show(task({ status: "failed", error: { message: "No.", canRetry: true } }))
        for (const name of ["Retry", "Discard", "Edit", "Cancel post"]) {
            expect(screen.queryByRole("button", { name })).toBeNull()
        }
    })
})

describe("when it is hidden", () => {
    it("on a chat thread, user app and org admin", () => {
        path.current = "/messages/chat/c-1"
        const first = show(task())
        expect(first.container.innerHTML).toBe("")
        first.unmount()

        path.current = "/organization/admin/o-1/messages/c-1"
        const second = show(task())
        expect(second.container.innerHTML).toBe("")
    })

    it("while the screen is showing a task", () => {
        const row = task({ id: "x" })
        show(row)
        expect(pill()).toBeTruthy()

        act(() => useUploadQueueStore.setState({ view: "expanded", focusedTaskId: "x" }))
        expect(pill()).toBeNull()

        act(() => useUploadQueueStore.setState({ view: "minimized" }))
        expect(pill()).toBeTruthy()
    })

    it("under data-chrome-covered, in its CSS", () => {
        const css = readFileSync(join(__dirname, "UploadQueueBar.module.css"), "utf8")
        expect(css).toMatch(/html\[data-chrome-covered\]\)\s*\.bar\s*\{\s*display:\s*none/)
    })

    it("below a page's own sticky header, in its CSS", () => {
        const css = readFileSync(join(__dirname, "UploadQueueBar.module.css"), "utf8")
        expect(css).toMatch(/html:has\(\[data-page-sticky-header\]\)\)\s*\.bar\s*\{\s*--pill-below/)
    })

    it("with nothing to show", () => {
        const { container } = show()
        expect(container.innerHTML).toBe("")
    })
})

describe("whose tasks", () => {
    it("only the active actor's", () => {
        const { container } = show(task({ actorKey: "org-1" }))
        expect(container.innerHTML).toBe("")
    })

    it("another actor's is not counted as waiting either", () => {
        show(task(), task({ actorKey: "org-1", status: "preparing" }))
        expect(screen.queryByText("+1")).toBeNull()
    })
})

describe("for a screen reader", () => {
    it("announces the status, not every 5%", () => {
        const row = task({ id: "p-1", status: "uploading", progress: 0.45 })
        show(row)
        expect(screen.getByRole("status").textContent).toBe("Posting…")

        act(() => store().patch("p-1", { progress: 0.5 }))
        expect(screen.getByRole("status").textContent).toBe("Posting…")

        act(() => store().patch("p-1", { status: "processing" }))
        expect(screen.getByRole("status").textContent).toBe("Processing…")
    })

    it("a failure announces its message", () => {
        show(task({ status: "failed", error: { message: "Too long.", canRetry: false } }))
        expect(screen.getByRole("status").textContent).toBe("Too long.")
    })

    it("the bar itself is not a live region", () => {
        show(task())
        expect(document.querySelector('[aria-live]:not([role="status"])')).toBeNull()
    })
})
