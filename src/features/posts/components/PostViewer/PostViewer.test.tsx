// @vitest-environment jsdom

/**
 * PostViewer — the parts that are easy to break and invisible when they are.
 *
 * Same shape as MediaLightbox.test.tsx: every close is awaited because it
 * routes through history.back(), and popstate is asynchronous. What is added
 * is the viewer's own contract — the double-tap like, the keyboard guard
 * while typing, the stacked back button, and the login wall for visitors.
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

    const viewer = (
        <PostViewer
            posts={[post]}
            initialPostId={post.id}
            onClose={onClose}
            {...props}
        />
    )

    const utils = render(
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

    return { post, onClose, ...utils }
}

/** The active slide's media surface — the thing a tap lands on. */
function activeMedia(): HTMLElement {
    const img = document.querySelector("[data-viewer-active] img, [data-viewer-active] video")
    return (img?.parentElement ?? document.querySelector("[data-viewer-active]")) as HTMLElement
}

function viewerDialog() {
    return screen.getByRole("dialog", { name: /post by/i })
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
