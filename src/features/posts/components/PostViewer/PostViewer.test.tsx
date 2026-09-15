// @vitest-environment jsdom

/**
 * PostViewer — the parts that are easy to break and invisible when they are.
 *
 * Same shape as MediaLightbox.test.tsx: every close is awaited because it
 * routes through history.back(), and popstate is asynchronous. What is added
 * is the viewer's own contract — the double-tap like, the keyboard guard
 * while typing, the stacked back button, the login wall for visitors, and
 * the text-only post as a page of the list.
 *
 * jsdom lays nothing out and applies no media queries, so the layout is
 * chosen through a matchMedia stub: `asDesktop()` for the split panel, the
 * default for the phone reels.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import PostViewer, { type PostViewerProps } from "./PostViewer"
import { PublicProfileProvider } from "@/features/profile/context/PublicProfileContext"
import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
import { useSoundStore } from "@/store/sound.store"
import type { Post, PostMedia } from "@/features/posts/services/posts.api"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}))

const push = vi.fn()
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
}))

vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({
        toProfile: (u: string) => `/profile/${u}`,
        toSearch: (q: string) => `/search?q=${encodeURIComponent(q)}`,
    }),
}))

vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({
    default: ({ initials }: { initials?: string }) => <span>{initials}</span>,
}))

// Heavy children that never open in these tests.
vi.mock("@/features/messages/components/ShareSheet/ShareSheet", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostOptionsSheet/PostOptionsSheet", () => ({ default: () => null }))
vi.mock("@/features/posts/components/EditPostModal/EditPostModal", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostLikesModal/PostLikesModal", () => ({ default: () => null }))
vi.mock("@/features/moderation/components/ReportSheet/ReportSheet", () => ({ default: () => null }))

const toggleLike = vi.fn()
vi.mock("@/features/posts/hooks/usePostMutations", () => ({
    useToggleLike: () => ({ mutate: toggleLike, isPending: false }),
    useToggleSave: () => ({ mutate: vi.fn(), isPending: false }),
    usePostComments: () => ({
        data: undefined,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
        isLoading: false,
    }),
    useCreateComment: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteComment: () => ({ mutate: vi.fn() }),
}))

/**
 * jsdom ships no matchMedia, and ReactionButton reads it on mount. The stub
 * answers the viewer's breakpoint query with `desktop` and everything else
 * (hover, reduced motion) with false.
 */
function installMatchMedia(desktop: boolean) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            matches: desktop && query === "(min-width: 768px)",
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    })
}

const asDesktop = () => installMatchMedia(true)

beforeEach(() => {
    installMatchMedia(false)
    // jsdom has no media stack; play() rejects loudly without this.
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    useSoundStore.setState({ muted: true })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    // jsdom keeps ONE history for the file: leave no overlay depth behind.
    window.history.replaceState(null, "")
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

// ── Fixtures ──────────────────────────────────────────────────

function image(n: number): PostMedia {
    return {
        id: `m${n}`,
        media_type: "image",
        file_url: `https://media.goatza.test/p/${n}.webp`,
        thumbnail_url: `https://media.goatza.test/p/${n}-thumb.webp`,
        duration: null,
        width: 1080,
        height: 1350,
        order: n,
    }
}

const CLIP: PostMedia = {
    id: "v1",
    media_type: "video",
    file_url: "https://media.goatza.test/p/clip.mp4",
    thumbnail_url: "https://media.goatza.test/p/clip.jpg",
    duration: 12,
    width: 1280,
    height: 720,
    order: 0,
}

function makePost(overrides: Partial<Post> = {}): Post {
    return {
        id: "post-1",
        content: "Trials this Sunday #football",
        post_type: "general",
        visibility: "public",
        likes_count: 3,
        likes_breakdown: { like: 3 },
        comments_count: 1,
        created_at: new Date().toISOString(),
        author: { id: "u1", username: "riya", name: "Riya", headline: "Striker" },
        author_type: "user",
        media: [image(0), image(1), image(2)],
        sport: null,
        reaction: { is_reacted: false, type: null },
        ...overrides,
    }
}

function renderViewer(
    props: Partial<PostViewerProps> = {},
    { publicView = false }: { publicView?: boolean } = {}
) {
    const post = props.posts?.[0] ?? makePost()
    const onClose = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const tree = (next: Partial<PostViewerProps>) => {
        const viewer = (
            <PostViewer
                posts={[post]}
                initialPostId={post.id}
                onClose={onClose}
                {...next}
            />
        )
        return (
            <QueryClientProvider client={qc}>
                <ToastProvider>
                    {publicView ? (
                        <PublicProfileProvider displayName="Riya" profilePath="/profile/riya" sections={{}}>
                            {viewer}
                        </PublicProfileProvider>
                    ) : (
                        viewer
                    )}
                </ToastProvider>
            </QueryClientProvider>
        )
    }

    const utils = render(tree(props))

    return {
        post,
        onClose,
        ...utils,
        /** Same tree, new viewer props — what a list re-rendering the viewer does. */
        rerenderViewer: (next: Partial<PostViewerProps>) => utils.rerender(tree({ ...props, ...next })),
    }
}

/** The active slide's media surface — the thing a tap lands on. */
function activeMedia(): HTMLElement {
    const img = document.querySelector("[data-viewer-active] img, [data-viewer-active] video")
    return (img?.parentElement ?? document.querySelector("[data-viewer-active]")) as HTMLElement
}

function viewerDialog() {
    return screen.getByRole("dialog", { name: /post by/i })
}

/** A text-only post: swiped onto from a media post, never opened directly. */
function textPost(overrides: Partial<Post> = {}): Post {
    return makePost({
        id: "post-text",
        content: "Big win tonight #kochi",
        media: [],
        author: { id: "u2", username: "arjun", name: "Arjun", headline: "" },
        ...overrides,
    })
}

/** The active text card — the thing a double-tap on a text post lands on. */
function activeTextCard(): HTMLElement {
    return document.querySelector("[data-viewer-text][data-viewer-active]") as HTMLElement
}

/**
 * jsdom lays nothing out: every scrollHeight and clientHeight is 0, so no
 * clamp ever "overflows". This makes every box taller than its clamp.
 */
function pretendOverflow() {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300)
}

// ── Tests ─────────────────────────────────────────────────────

describe("PostViewer", () => {
    it("is a modal dialog that opens at the tapped slide", () => {
        renderViewer({ initialSlide: 1 })

        const dialog = viewerDialog()
        expect(dialog.getAttribute("aria-modal")).toBe("true")
        expect(screen.getByText("2/3")).toBeTruthy()
        // The tapped slide is the one carrying the full-size image.
        expect(activeMedia().querySelector("img")?.getAttribute("src")).toContain("/1")
    })

    // Every close is awaited: the button, Esc and the phone's back gesture are
    // the SAME path through history.back(), so none can skip the others.
    it("closes on Escape, reporting where the reader was", async () => {
        const { onClose, post } = renderViewer({ initialSlide: 2 })

        fireEvent.keyDown(document, { key: "Escape" })

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        expect(onClose).toHaveBeenCalledWith(post.id, 2, "close")
    })

    it("closes exactly once from the close button", async () => {
        const { onClose } = renderViewer()

        fireEvent.click(screen.getByRole("button", { name: "Close" }))

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // Two overlays, two history entries: one back press must close the sheet
    // and leave the viewer up — the bug useBackToClose exists for.
    it("back with the comments sheet open closes only the sheet", async () => {
        const { onClose } = renderViewer()

        fireEvent.click(screen.getByRole("button", { name: "Comment" }))
        expect(screen.getByRole("dialog", { name: "Comments" })).toBeTruthy()

        window.history.back()

        await waitFor(() =>
            expect(screen.queryByRole("dialog", { name: "Comments" })).toBeNull()
        )
        expect(onClose).not.toHaveBeenCalled()
        expect(viewerDialog()).toBeTruthy()
    })

    describe("double-tap like", () => {
        // The like endpoint is a TOGGLE: a double-tap on an already-liked post
        // must not unlike it.
        it("likes an unreacted post", () => {
            const { post } = renderViewer()

            const media = activeMedia()
            fireEvent.click(media)
            fireEvent.click(media)

            expect(toggleLike).toHaveBeenCalledTimes(1)
            expect(toggleLike).toHaveBeenCalledWith({ post_id: post.id, type: "like" })
        })

        it("does nothing to the reaction when the post is already reacted", () => {
            renderViewer({
                posts: [makePost({ reaction: { is_reacted: true, type: "fire" } })],
            })

            const media = activeMedia()
            fireEvent.click(media)
            fireEvent.click(media)

            expect(toggleLike).not.toHaveBeenCalled()
        })
    })

    describe("text-only posts", () => {
        const LIST = [makePost(), textPost(), makePost({ id: "post-3" })]

        it("is a page between media posts, with the author row but not the caption", () => {
            renderViewer({ posts: LIST })
            expect(screen.getByText("1/3")).toBeTruthy()

            fireEvent.keyDown(document, { key: "ArrowDown" })

            expect(viewerDialog().getAttribute("aria-label")).toBe("Post by Arjun")
            const card = activeTextCard()
            expect(card).toBeTruthy()
            // The words are on the card, once — the overlay shows the author only.
            const words = screen.getAllByText(/Big win tonight/)
            expect(words).toHaveLength(1)
            expect(card.contains(words[0])).toBe(true)
            expect(screen.getByText("Arjun")).toBeTruthy()
            // Nothing that only media has.
            expect(screen.queryByRole("button", { name: /mute video/i })).toBeNull()
            expect(screen.queryByText(/\d\/\d/)).toBeNull()
            // The hashtag is still a link.
            expect(screen.getByRole("link", { name: "#kochi" })).toBeTruthy()
        })

        it("shows the words on the desktop stage, not in the panel caption", () => {
            asDesktop()
            renderViewer({ posts: LIST })

            fireEvent.keyDown(document, { key: "ArrowDown" })

            const words = screen.getAllByText(/Big win tonight/)
            expect(words).toHaveLength(1)
            expect(activeTextCard().contains(words[0])).toBe(true)
        })

        it("likes on a double-tap, once, and never an already-reacted post", () => {
            renderViewer({ posts: LIST })
            fireEvent.keyDown(document, { key: "ArrowDown" })

            const card = activeTextCard()
            fireEvent.click(card)
            fireEvent.click(card)

            expect(toggleLike).toHaveBeenCalledTimes(1)
            expect(toggleLike).toHaveBeenCalledWith({ post_id: "post-text", type: "like" })
            expect(card.querySelector("[data-like-burst]")).toBeTruthy()

            cleanup()
            toggleLike.mockClear()
            renderViewer({
                posts: [makePost(), textPost({ reaction: { is_reacted: true, type: "fire" } })],
            })
            fireEvent.keyDown(document, { key: "ArrowDown" })
            const reacted = activeTextCard()
            fireEvent.click(reacted)
            fireEvent.click(reacted)
            expect(toggleLike).not.toHaveBeenCalled()
        })

        // A tap on a control is that control's: "Read more" then the card, or
        // the card then a hashtag, is not a double-tap.
        it("does not count taps on Read more or a link towards a double-tap", async () => {
            pretendOverflow()
            const { onClose } = renderViewer({ posts: LIST })
            fireEvent.keyDown(document, { key: "ArrowDown" })
            const card = activeTextCard()

            fireEvent.click(screen.getByRole("button", { name: "Read more" }))
            fireEvent.click(card)
            expect(toggleLike).not.toHaveBeenCalled()
            // Let the held single tap lapse before the next pair.
            await act(() => new Promise((r) => setTimeout(r, 300)))

            fireEvent.click(card)
            fireEvent.click(screen.getByRole("link", { name: "#kochi" }))
            expect(toggleLike).not.toHaveBeenCalled()

            // The link closes the viewer to navigate (through history.back());
            // awaited so its popstate cannot land in the next test.
            await waitFor(() => expect(push).toHaveBeenCalledWith("/search?q=%23kochi"))
            await waitFor(() => expect(onClose).toHaveBeenCalledWith("post-text", 0, "navigate"))
        })

        it("offers Read more only when the clamp hides something", () => {
            renderViewer({ posts: LIST })
            fireEvent.keyDown(document, { key: "ArrowDown" })
            expect(screen.queryByRole("button", { name: "Read more" })).toBeNull()

            cleanup()
            pretendOverflow()
            renderViewer({ posts: LIST })
            fireEvent.keyDown(document, { key: "ArrowDown" })

            const more = screen.getByRole("button", { name: "Read more" })
            expect(more.getAttribute("aria-expanded")).toBe("false")
            fireEvent.click(more)
            expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true")
        })

        it("does nothing on the slide keys or zoom keys", () => {
            renderViewer({ posts: LIST })
            fireEvent.keyDown(document, { key: "ArrowDown" })

            fireEvent.keyDown(document, { key: "ArrowRight" })
            fireEvent.keyDown(document, { key: "+" })
            fireEvent.keyDown(document, { key: "ArrowLeft" })

            expect(viewerDialog().getAttribute("aria-label")).toBe("Post by Arjun")
            expect(activeTextCard()).toBeTruthy()
        })
    })

    // The bolt belongs to the post and slide that was double-tapped. It used
    // to be a counter that every newly mounted slide replayed, so swiping on
    // after one like made the next posts look liked too.
    it("does not replay the like burst on the next post", () => {
        renderViewer({ posts: [makePost(), makePost({ id: "post-2" }), textPost()] })

        const media = activeMedia()
        fireEvent.click(media)
        fireEvent.click(media)
        expect(document.querySelector("[data-like-burst]")).toBeTruthy()

        fireEvent.keyDown(document, { key: "ArrowDown" })
        expect(document.querySelector("[data-like-burst]")).toBeNull()

        fireEvent.keyDown(document, { key: "ArrowDown" })
        expect(activeTextCard()).toBeTruthy()
        expect(document.querySelector("[data-like-burst]")).toBeNull()
    })

    describe("keyboard", () => {
        // Typing a comment must never pause or mute the video.
        it("ignores shortcuts while focus is in the composer", async () => {
            asDesktop()
            const { onClose } = renderViewer({ posts: [makePost({ media: [CLIP] })] })

            const input = screen.getByPlaceholderText("Write a comment...")
            input.focus()

            fireEvent.keyDown(input, { key: "m" })
            expect(useSoundStore.getState().muted).toBe(true)

            fireEvent.keyDown(input, { key: "Escape" })
            await act(() => new Promise((r) => setTimeout(r, 20)))
            expect(onClose).not.toHaveBeenCalled()

            // Same key, outside the input: the shortcut works.
            fireEvent.keyDown(document.body, { key: "m" })
            expect(useSoundStore.getState().muted).toBe(false)
        })

        it("changes slides with the arrow keys", () => {
            renderViewer()

            fireEvent.keyDown(document, { key: "ArrowRight" })
            expect(screen.getByText("2/3")).toBeTruthy()

            fireEvent.keyDown(document, { key: "ArrowLeft" })
            expect(screen.getByText("1/3")).toBeTruthy()
        })
    })

    // The viewer asks for the next page once per approach to the end and
    // guards against asking twice. The guard used to clear only when a render
    // saw isFetchingNextPage go true — a fetch that started and settled
    // between two renders never showed one, and the tail said "Loading
    // more…" forever.
    describe("pagination guard", () => {
        const pagination = (fetchNextPage: () => unknown) => ({
            hasNextPage: true,
            isFetchingNextPage: false,
            fetchNextPage,
        })

        it("recovers after a fetch that starts and settles between renders", async () => {
            const fetchNextPage = vi.fn(() => Promise.resolve())
            const { post, rerenderViewer } = renderViewer({ pagination: pagination(fetchNextPage) })
            expect(fetchNextPage).toHaveBeenCalledTimes(1)

            // The page landed (one more post) without this component ever
            // rendering a `true` flag.
            await act(async () => {})
            rerenderViewer({
                posts: [post, makePost({ id: "post-2" })],
                pagination: pagination(fetchNextPage),
            })

            expect(fetchNextPage).toHaveBeenCalledTimes(2)
        })

        it("recovers on its own when the fetch never reports back", async () => {
            vi.useFakeTimers()
            try {
                const fetchNextPage = vi.fn(() => new Promise(() => {}))
                const { post, rerenderViewer } = renderViewer({ pagination: pagination(fetchNextPage) })
                expect(fetchNextPage).toHaveBeenCalledTimes(1)

                // Still guarded: a re-render before the timeout asks nothing.
                rerenderViewer({ posts: [post, makePost({ id: "post-2" })], pagination: pagination(fetchNextPage) })
                expect(fetchNextPage).toHaveBeenCalledTimes(1)

                await act(() => vi.advanceTimersByTimeAsync(10_000))
                rerenderViewer({ posts: [post, makePost({ id: "post-2" }), makePost({ id: "post-3" })], pagination: pagination(fetchNextPage) })

                expect(fetchNextPage).toHaveBeenCalledTimes(2)
            } finally {
                vi.useRealTimers()
            }
        })
    })

    describe("logged out", () => {
        // A public profile's post keeps every affordance visible and walls each
        // one — exactly what PostActions does on the card.
        it("opens the login wall instead of liking", () => {
            renderViewer({}, { publicView: true })

            fireEvent.click(screen.getByRole("button", { name: "Like" }))

            expect(toggleLike).not.toHaveBeenCalled()
            expect(screen.getByText(/join goatza to react to posts from/i)).toBeTruthy()
        })

        it("opens the login wall on a double-tap too", () => {
            renderViewer({}, { publicView: true })

            const media = activeMedia()
            fireEvent.click(media)
            fireEvent.click(media)

            expect(toggleLike).not.toHaveBeenCalled()
            expect(screen.getByText(/join goatza to react to posts from/i)).toBeTruthy()
        })
    })
})
