// @vitest-environment jsdom
/**
 * UploadScreen and open-when-done, against the REAL queue: tap Post, the screen
 * opens, Minimize / back / Esc minimize and never cancel, history stays clean, a
 * failure shows the right actions, and a task finishing in front of its author
 * opens their posts — unless they minimized, switched account or are already
 * there.
 *
 * The queue keeps module-level state, so every test imports a fresh copy, the
 * same as uploadQueue.test.ts. The timers are real, so a flow takes as long as
 * it takes (~700 ms); jsdom's history is real too.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PendingPublication } from "@/shared/services/publications"
import { OVERLAY_STATE_KEY } from "@/shared/hooks/useBackToClose"

const mocks = vi.hoisted(() => ({
    invalidateQueries: vi.fn(),
    invalidatePostLists: vi.fn(),
    fetchPublications: vi.fn(),
    cancelPublication: vi.fn(),
    dismissPublication: vi.fn(),
    push: vi.fn(),
    isFetching: vi.fn(() => 0),
}))
const path = vi.hoisted(() => ({ current: "/home" }))

vi.mock("next/navigation", () => ({
    usePathname: () => path.current,
    useRouter: () => ({ push: mocks.push }),
}))
vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))
vi.mock("@/core/react-query/QueryProvider", () => ({
    queryClient: {
        invalidateQueries: mocks.invalidateQueries,
        isFetching: mocks.isFetching,
        getQueryCache: () => ({ subscribe: () => () => {} }),
    },
}))
vi.mock("@/features/posts/hooks/usePostMutations", () => ({
    invalidatePostLists: mocks.invalidatePostLists,
    POST_CACHE_KEYS: [["posts", "list"]],
}))
vi.mock("@/features/highlights/hooks/useHighlights", () => ({
    highlightKeys: { all: ["highlights"] },
}))
vi.mock("@/features/profile/hooks/useProfileQueries", () => ({
    profileKeys: { me: () => ["profile", "me"], user: (u: string) => ["profile", "user", u] },
}))
vi.mock("@/features/messages/services/chatUpload.service", () => ({
    captureVideoThumbnail: vi.fn(async () => ""),
}))
vi.mock("@/shared/services/mediaCapabilities", () => ({
    ensureMediaCapabilities: vi.fn(async () => ({ server_processing: true })),
}))
vi.mock("@/shared/hooks/useScreenWakeLock", () => ({
    holdScreenWakeLock: () => () => {},
}))
vi.mock("@/shared/services/publications", () => ({
    fetchPublications: mocks.fetchPublications,
    cancelPublication: mocks.cancelPublication,
    dismissPublication: mocks.dismissPublication,
}))

type Queue = typeof import("@/shared/upload/uploadQueue")

let queue: Queue
let store: typeof import("@/store/uploadQueue.store").useUploadQueueStore
let auth: typeof import("@/store/auth.store")
let bus: typeof import("@/core/ws/realtimeBus").realtimeBus
let UploadScreen: typeof import("./UploadScreen").default
let UploadQueueBar: typeof import("../UploadQueueBar/UploadQueueBar").default
let useBackToClose: typeof import("@/shared/hooks/useBackToClose").useBackToClose

const DESTINATION = { href: "/profile/player1/posts", kind: "posts" } as const

const depth = () =>
    (window.history.state?.[OVERLAY_STATE_KEY]?.depth as number | undefined) ?? 0
const tasks = () => store.getState().tasks
const view = () => store.getState().view
const dialog = () => screen.queryByRole("dialog")

/** A run that does not finish until the test says so. */
function deferredRun() {
    let finish: (value: { kind: "done"; result: object }) => void = () => {}
    let fail: (err: unknown) => void = () => {}
    const run = vi.fn(
        () =>
            new Promise<never>((resolve, reject) => {
                finish = resolve as never
                fail = reject
            })
    )
    return {
        run,
        finish: () => act(async () => finish({ kind: "done", result: { postId: "p-1" } })),
        fail: (err: unknown) => act(async () => fail(err)),
    }
}

const enqueue = (run: never, over: object = {}) =>
    queue.enqueueUpload({
        kind: "post",
        label: "Match day",
        preview: { mediaType: "none" },
        destination: DESTINATION,
        run,
        ...over,
    })

function Shell() {
    return (
        <>
            <UploadQueueBar />
            <UploadScreen />
        </>
    )
}

/** Open, and past the tick its history entry waits for. */
async function openScreen(run: never, over: object = {}) {
    let id = ""
    act(() => {
        id = enqueue(run, over)
    })
    const utils = render(<Shell />)
    await waitFor(() => expect(depth()).toBe(1))
    return { id, ...utils }
}

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

beforeEach(async () => {
    vi.resetModules()
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.isFetching.mockReturnValue(0)
    mocks.fetchPublications.mockResolvedValue([])
    mocks.dismissPublication.mockResolvedValue({})
    path.current = "/home"
    window.history.replaceState(null, "")

    auth = await import("@/store/auth.store")
    auth.useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
    })
    queue = await import("@/shared/upload/uploadQueue")
    store = (await import("@/store/uploadQueue.store")).useUploadQueueStore
    bus = (await import("@/core/ws/realtimeBus")).realtimeBus
    UploadScreen = (await import("./UploadScreen")).default
    UploadQueueBar = (await import("../UploadQueueBar/UploadQueueBar")).default
    useBackToClose = (await import("@/shared/hooks/useBackToClose")).useBackToClose
})

afterEach(async () => {
    cleanup()
    // The orphan check runs a tick after an unmount, and pops.
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
    })
    window.history.replaceState(null, "")
})

describe("opening", () => {
    it("a new task opens it, expanded on that task", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        expect(screen.getByRole("dialog", { name: "Posting" })).toBeTruthy()
        expect(view()).toBe("expanded")
    })

    it("expand: false does not", async () => {
        const { run } = deferredRun()
        act(() => {
            enqueue(run as never, { expand: false })
        })
        render(<Shell />)

        expect(dialog()).toBeNull()
        expect(screen.getByRole("button", { name: /Posting/ })).toBeTruthy()
    })

    it("a task restored after a reload stays on the pill", async () => {
        mocks.fetchPublications.mockResolvedValue([publication()])
        render(<Shell />)

        await waitFor(() => expect(tasks()).toHaveLength(1))
        expect(view()).toBe("minimized")
        expect(dialog()).toBeNull()
        expect(screen.getByRole("button", { name: "Processing…" })).toBeTruthy()
    })

    it("a tap on a restored task's pill opens it", async () => {
        mocks.fetchPublications.mockResolvedValue([publication()])
        render(<Shell />)
        await waitFor(() => expect(tasks()).toHaveLength(1))

        fireEvent.click(screen.getByRole("button", { name: "Processing…" }))

        expect(screen.getByRole("dialog")).toBeTruthy()
    })

    it("focus goes to Minimize", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Minimize" }))
    })

    it("names the dialog from its title", async () => {
        const { run } = deferredRun()
        await openScreen(run as never, { kind: "highlight", destination: undefined })

        expect(screen.getByRole("dialog", { name: "Adding highlight" })).toBeTruthy()
    })

    it("shows a text post's words, a preview, a caption", async () => {
        const { run } = deferredRun()
        await openScreen(run as never, {
            preview: { mediaType: "image", localThumbUrl: "blob:thumb" },
        })

        expect(document.querySelector('img[src="blob:thumb"]')).toBeTruthy()
        expect(screen.getByText("Match day")).toBeTruthy()
    })
})

describe("minimizing never cancels", () => {
    const stillThere = () => {
        expect(tasks()).toHaveLength(1)
        expect(tasks()[0].status).not.toBe("cancelled")
        expect(mocks.cancelPublication).not.toHaveBeenCalled()
    }

    it("the Minimize button", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        fireEvent.click(screen.getByRole("button", { name: "Minimize" }))

        await waitFor(() => expect(view()).toBe("minimized"))
        stillThere()
        expect(dialog()).toBeNull()
    })

    it("Keep browsing", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        fireEvent.click(screen.getByRole("button", { name: "Keep browsing" }))

        await waitFor(() => expect(view()).toBe("minimized"))
        stillThere()
    })

    it("Esc", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        fireEvent.keyDown(document, { key: "Escape" })

        await waitFor(() => expect(view()).toBe("minimized"))
        stillThere()
    })

    it("the back gesture", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        act(() => window.history.back())

        await waitFor(() => expect(view()).toBe("minimized"))
        stillThere()
    })

    it("the pill takes over, and the upload is still going", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never)

        fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
        await waitFor(() => expect(screen.getByRole("button", { name: /Posting/ })).toBeTruthy())

        await finish()
        await waitFor(() => expect(tasks()[0].status).toBe("done"))
    })
})

describe("history", () => {
    it("one entry while open; one back = minimize, and then it is gone", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)
        expect(depth()).toBe(1)

        act(() => window.history.back())
        await waitFor(() => expect(view()).toBe("minimized"))

        expect(depth()).toBe(0)
    })

    it("after posting: the composer's entry goes first, so no ghost is left", async () => {
        const { run } = deferredRun()

        // A composer that DOES hold an entry, closing in the tick the screen opens.
        function Composer({ onPost }: { onPost: () => void }) {
            useBackToClose(() => {})
            return <button onClick={onPost}>Post</button>
        }
        function App() {
            const [composing, setComposing] = useState(true)
            return (
                <>
                    {composing && (
                        <Composer
                            onPost={() => {
                                enqueue(run as never)
                                setComposing(false)
                            }}
                        />
                    )}
                    <Shell />
                </>
            )
        }
        render(<App />)
        expect(depth()).toBe(1)

        fireEvent.click(screen.getByRole("button", { name: "Post" }))
        expect(screen.getByRole("dialog")).toBeTruthy()

        // The composer's entry popped, THEN the screen's pushed. Not 2.
        await waitFor(() => expect(depth()).toBe(1))
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50))
        })
        expect(depth()).toBe(1)

        act(() => window.history.back())
        await waitFor(() => expect(view()).toBe("minimized"))
        expect(depth()).toBe(0)
    })

    it("a task removed from under it pops its entry", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)

        act(() => queue.dismissUpload(id))

        await waitFor(() => expect(depth()).toBe(0))
        expect(dialog()).toBeNull()
    })

    it("locks the scroll, and lets go", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)
        expect(document.documentElement.hasAttribute("data-scroll-locked")).toBe(true)

        fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
        await waitFor(() => expect(document.documentElement.hasAttribute("data-scroll-locked")).toBe(false))
    })
})

describe("cancelling", () => {
    it("asks first", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)

        fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }))

        const question = screen.getByRole("alertdialog", { name: "Cancel this post?" })
        expect(tasks()).toHaveLength(1)
        fireEvent.click(within(question).getByRole("button", { name: "Keep going" }))
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(tasks()).toHaveLength(1)
        expect(dialog()).toBeTruthy()
    })

    it("confirmed, it stops the upload and the screen goes", async () => {
        const run = vi.fn(
            ({ signal }: { signal: AbortSignal }) =>
                new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)))
        )
        await openScreen(run as never)

        fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }))
        const question = screen.getByRole("alertdialog")
        fireEvent.click(within(question).getByRole("button", { name: "Cancel post" }))

        await waitFor(() => expect(tasks()).toHaveLength(0))
        expect(dialog()).toBeNull()
    })

    it("Esc answers the question, not the screen", async () => {
        const { run } = deferredRun()
        await openScreen(run as never)
        fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }))

        fireEvent.keyDown(document, { key: "Escape" })

        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
        expect(view()).toBe("expanded")
    })

    it("not while publishing: the create is already in flight", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)

        act(() => store.getState().patch(id, { status: "publishing" }))

        expect(screen.queryByRole("button", { name: "Cancel upload" })).toBeNull()
    })
})

describe("a failure", () => {
    // Really fails first: a run still in flight would hold the queue, and Retry
    // would wait behind it for ever.
    const failWith = async (error: object, over: object = {}) => {
        const { run, fail } = deferredRun()
        const { id } = await openScreen(run as never, over)
        await fail(new Error("nope"))
        await waitFor(() => expect(tasks()[0].status).toBe("failed"))
        act(() => store.getState().patch(id, { error } as never))
        return { id, run }
    }
    const buttons = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)

    it("says what happened, under its own title", async () => {
        await failWith({ message: "Upload failed (UPLOAD_NETWORK)", canRetry: true })

        expect(screen.getByRole("dialog", { name: "Couldn't post" })).toBeTruthy()
        // On screen, and in the live region.
        expect(screen.getAllByText("Upload failed (UPLOAD_NETWORK)")).toHaveLength(2)
        expect(screen.getByRole("status").textContent).toBe("Upload failed (UPLOAD_NETWORK)")
        expect(document.querySelector('[data-icon="mdi:alert-circle-outline"]')).toBeTruthy()
    })

    it("Retry when it can help", async () => {
        await failWith({ message: "No.", canRetry: true })

        expect(buttons()).toEqual(["Minimize", "Retry", "Discard"])
    })

    it("Edit when it cannot and there is a draft", async () => {
        await failWith({ message: "Too long.", canRetry: false }, { onEdit: vi.fn() })

        expect(buttons()).toEqual(["Minimize", "Edit", "Discard"])
    })

    it("Discard only with nothing else to offer", async () => {
        await failWith({ message: "Gone.", canRetry: false })

        expect(buttons()).toEqual(["Minimize", "Discard"])
    })

    it("Post without sound when the sound was lost", async () => {
        await failWith({ message: "No sound.", canRetry: true, canRetryWithoutSound: true })

        expect(buttons()).toEqual(["Minimize", "Retry", "Post without sound", "Discard"])
    })

    it("Add without sound, for a highlight", async () => {
        await failWith(
            { message: "No sound.", canRetry: true, canRetryWithoutSound: true },
            { kind: "highlight", destination: undefined }
        )

        expect(screen.getByRole("button", { name: "Add without sound" })).toBeTruthy()
        expect(screen.getByRole("dialog", { name: "Couldn't add highlight" })).toBeTruthy()
    })

    it("Retry runs it again and the screen stays", async () => {
        const { run } = await failWith({ message: "No.", canRetry: true })

        fireEvent.click(screen.getByRole("button", { name: "Retry" }))

        await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
        expect(tasks()[0].status).toBe("preparing")
        expect(dialog()).toBeTruthy()
    })

    it("Post without sound retries with the flag", async () => {
        const { run } = await failWith({ message: "No sound.", canRetry: true, canRetryWithoutSound: true })

        fireEvent.click(screen.getByRole("button", { name: "Post without sound" }))

        await waitFor(() => expect(run).toHaveBeenCalledTimes(2))
        const [ctx] = run.mock.lastCall as unknown as [{ allowSilentAudio: boolean }]
        expect(ctx.allowSilentAudio).toBe(true)
    })

    it("Edit reopens the draft, and the screen goes", async () => {
        const onEdit = vi.fn()
        await failWith({ message: "Too long.", canRetry: false }, { onEdit })

        fireEvent.click(screen.getByRole("button", { name: "Edit" }))

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(tasks()).toHaveLength(0)
        expect(dialog()).toBeNull()
    })

    it("Discard drops it, and a failure the server holds is dismissed there too", async () => {
        const { id } = await failWith({ message: "No.", canRetry: false })
        act(() => store.getState().patch(id, { publicationId: "pub-9" }))

        fireEvent.click(screen.getByRole("button", { name: "Discard" }))

        expect(tasks()).toHaveLength(0)
        expect(mocks.dismissPublication).toHaveBeenCalledWith("pub-9", expect.anything())
    })

    it("a run that really fails ends up here", async () => {
        const { run, fail } = deferredRun()
        await openScreen(run as never)

        await fail(new Error("nope"))

        await waitFor(() => expect(tasks()[0].status).toBe("failed"))
        expect(screen.getByRole("dialog", { name: "Couldn't post" })).toBeTruthy()
    })
})

describe("the steps", () => {
    const steps = () =>
        Array.from(document.querySelectorAll("ol li")).map((li) => li.textContent)

    it("Prepare · Upload · Publish, with Process once the server holds it", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)
        expect(steps()).toEqual(["Prepare", "Upload", "Publish"])

        act(() => store.getState().patch(id, { status: "processing", publicationId: "pub-1" }))

        expect(steps()).toEqual(["Prepare", "Upload", "Process", "Publish"])
    })

    it("a retry replaces the status line", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)

        act(() => store.getState().patch(id, { status: "uploading", retryLabel: "Retrying… (2/4)" }))

        expect(screen.getByText("Retrying… (2/4)")).toBeTruthy()
    })

    it("the count is on the progressbar; the server's time is indeterminate", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)

        act(() => store.getState().patch(id, { status: "uploading", progress: 0.45 }))
        expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("45")
        expect(screen.getByText("45%")).toBeTruthy()

        act(() => store.getState().patch(id, { status: "processing" }))
        expect(screen.getByRole("progressbar").hasAttribute("aria-valuenow")).toBe(false)
    })

    it("the hint matches the state", async () => {
        const { run } = deferredRun()
        const { id } = await openScreen(run as never)
        expect(screen.getByText(/Keep Goatza open until the upload finishes/)).toBeTruthy()

        act(() =>
            store.getState().patch(id, {
                status: "processing",
                preview: { mediaType: "video" },
            })
        )
        expect(screen.getByText(/Your video is being processed. You can leave/)).toBeTruthy()
    })

    it("says how many more are waiting", async () => {
        const first = deferredRun()
        act(() => {
            enqueue(first.run as never)
        })
        const second = deferredRun()
        await openScreen(second.run as never)

        expect(screen.getByText("1 more waiting")).toBeTruthy()
    })
})

describe("open when done", () => {
    it("done while expanded: the done state, then Opening…, then the push", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never)

        await finish()

        expect(screen.getByRole("dialog", { name: "Posted" })).toBeTruthy()
        expect(mocks.push).not.toHaveBeenCalled()

        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Opening your posts…"))
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DESTINATION.href))
    })

    it("closes once the pathname matches, and leaves no entry behind", async () => {
        const { run, finish } = deferredRun()
        const { rerender } = await openScreen(run as never)

        await finish()
        await waitFor(() => expect(mocks.push).toHaveBeenCalled())
        // The screen stays up until the page has arrived.
        expect(dialog()).toBeTruthy()
        expect(depth()).toBe(0)

        path.current = DESTINATION.href
        rerender(<Shell />)

        await waitFor(() => expect(dialog()).toBeNull())
        expect(tasks()).toHaveLength(0)
        expect(view()).toBe("minimized")
    })

    it("closes after 3 s if it never does", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never)

        await finish()
        await waitFor(() => expect(mocks.push).toHaveBeenCalled())

        await waitFor(() => expect(dialog()).toBeNull(), { timeout: 5000 })
        expect(tasks()).toHaveLength(0)
    })

    it("Opening your profile…, for a highlight", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never, {
            kind: "highlight",
            destination: { href: "/profile/player1", kind: "profile" },
        })

        await finish()

        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Opening your profile…"))
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/profile/player1"))
    })

    it("waits for the list refetch, at most 2 s", async () => {
        let fetching = 1
        mocks.isFetching.mockImplementation(() => fetching)
        const { run, finish } = deferredRun()
        await openScreen(run as never)

        await finish()
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Opening your posts…"))
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 300))
        })
        expect(mocks.push).not.toHaveBeenCalled()

        fetching = 0
        await waitFor(() => expect(mocks.push).toHaveBeenCalled(), { timeout: 3000 })
    })

    it("already on the destination: no push, and it closes", async () => {
        path.current = DESTINATION.href
        window.scrollTo = vi.fn()
        const { run, finish } = deferredRun()
        await openScreen(run as never)

        await finish()

        await waitFor(() => expect(dialog()).toBeNull())
        expect(mocks.push).not.toHaveBeenCalled()
        expect(tasks()).toHaveLength(0)
        expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    })

    it("done while minimized: no push, and the pill says Posted · View", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never)
        fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
        await waitFor(() => expect(view()).toBe("minimized"))

        await finish()
        await waitFor(() => expect(screen.getByRole("button", { name: "Posted · View" })).toBeTruthy())
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 900))
        })

        expect(mocks.push).not.toHaveBeenCalled()
    })

    it("minimizing during the done state calls it off", async () => {
        const { run, finish } = deferredRun()
        await openScreen(run as never)
        await finish()

        fireEvent.click(screen.getByRole("button", { name: "Minimize" }))
        await waitFor(() => expect(view()).toBe("minimized"))
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 900))
        })

        expect(mocks.push).not.toHaveBeenCalled()
        expect(screen.getByRole("button", { name: "Posted · View" })).toBeTruthy()
    })

    it("account switched since it started: no push, 'Posted' only", async () => {
        const { run, finish } = deferredRun()
        const { rerender } = await openScreen(run as never)

        act(() => auth.useAuthStore.setState({ actorType: "organization", actorId: "org-1" }))
        rerender(<Shell />)
        await finish()

        expect(screen.getByRole("dialog", { name: "Posted" })).toBeTruthy()
        await waitFor(() => expect(view()).toBe("minimized"), { timeout: 3000 })
        expect(mocks.push).not.toHaveBeenCalled()
    })

    it("a 202 finishing through publication_updated while expanded: push", async () => {
        const run = vi.fn(async () => ({ kind: "processing", publication: publication() }))
        await openScreen(run as never)
        await waitFor(() => expect(tasks()[0].status).toBe("processing"))
        expect(screen.getByRole("dialog", { name: "Posting" })).toBeTruthy()

        act(() => {
            bus.emit({
                notification_type: "publication_updated",
                publication: publication({ status: "published", result_id: "p-1" }),
            } as never)
        })

        await waitFor(() => expect(tasks()[0]?.status ?? "gone").not.toBe("processing"))
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DESTINATION.href))
    })

    it("carrying on across a shell swap: the new screen pushes nothing", async () => {
        const { run, finish } = deferredRun()
        const first = await openScreen(run as never)
        await finish()
        await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1))

        // /home → /profile/x/posts changes route group, and so unmounts the shell.
        first.unmount()
        const before = depth()
        render(<Shell />)
        expect(dialog()).toBeTruthy()
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 30))
        })

        expect(depth()).toBe(before)
        expect(mocks.push).toHaveBeenCalledTimes(1)
    })
})
