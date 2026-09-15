// @vitest-environment jsdom

/**
 * PostViewerProvider — the list contract: cards open the LIST's viewer at
 * their own post, the viewer walks the media posts of that list, the end of
 * it is shown, and closing lands the list on the last post viewed — unless
 * the close was a link tap, in which case the page is leaving anyway.
 *
 * Same conventions as PostViewer.test.tsx (mocks, matchMedia stub, awaited
 * closes); see there for why.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import PostViewerProvider, { usePostViewer } from "./PostViewerProvider"
import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
import { useSoundStore } from "@/store/sound.store"
import { usePostViewerStore } from "@/store/postViewer.store"
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

vi.mock("@/features/messages/components/ShareSheet/ShareSheet", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostOptionsSheet/PostOptionsSheet", () => ({ default: () => null }))
vi.mock("@/features/posts/components/EditPostModal/EditPostModal", () => ({ default: () => null }))
vi.mock("@/features/posts/components/PostLikesModal/PostLikesModal", () => ({ default: () => null }))
vi.mock("@/features/moderation/components/ReportSheet/ReportSheet", () => ({ default: () => null }))

vi.mock("@/features/posts/hooks/usePostMutations", () => ({
    useToggleLike: () => ({ mutate: vi.fn(), isPending: false }),
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

const landOnPost = vi.fn()
vi.mock("@/features/posts/utils/landOnPost", () => ({
    landOnPost: (...args: unknown[]) => landOnPost(...args),
}))

function installMatchMedia() {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }),
    })
}

beforeEach(() => {
    installMatchMedia()
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    useSoundStore.setState({ muted: true })
    usePostViewerStore.setState({ landings: {} })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    window.history.replaceState(null, "")
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

// ── Fixtures ──────────────────────────────────────────────────

function image(id: string): PostMedia {
    return {
        id: `${id}-m0`,
        media_type: "image",
        file_url: `https://media.goatza.test/${id}/0.webp`,
        thumbnail_url: `https://media.goatza.test/${id}/0-thumb.webp`,
        duration: null,
        width: 1080,
        height: 1350,
        order: 0,
    }
}

function makePost(id: string, author: string, withMedia = true): Post {
    return {
        id,
        content: `Post ${id}`,
        post_type: "general",
        visibility: "public",
        likes_count: 0,
        likes_breakdown: {},
        comments_count: 0,
        created_at: new Date().toISOString(),
        author: { id: `u-${author}`, username: author.toLowerCase(), name: author, headline: "" },
        author_type: "user",
        media: withMedia ? [image(id)] : [],
        sport: null,
        reaction: { is_reacted: false, type: null },
    }
}

const POSTS = [
    makePost("p1", "Riya"),
    makePost("p2", "Arjun", false), // text-only: never in the viewer
    makePost("p3", "Meera"),
    makePost("p4", "Dev"),
]

/** A stand-in card: opens the list's viewer at its post. */
function Card({ post }: { post: Post }) {
    const viewer = usePostViewer()
    return (
        <button type="button" onClick={() => viewer?.open(post.id, 0)}>
            open {post.id}
        </button>
    )
}

function renderList({
    posts = POSTS,
    hasNextPage = false,
    endLabel = "Back to feed",
}: { posts?: Post[]; hasNextPage?: boolean; endLabel?: string } = {}) {
    const fetchNextPage = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const utils = render(
        <QueryClientProvider client={qc}>
            <ToastProvider>
                <PostViewerProvider
                    posts={posts}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={false}
                    fetchNextPage={fetchNextPage}
                    endLabel={endLabel}
                >
                    {posts.map((p) => (
                        <Card key={p.id} post={p} />
                    ))}
                </PostViewerProvider>
            </ToastProvider>
        </QueryClientProvider>
    )

    return { fetchNextPage, ...utils }
}

function viewerDialog() {
    return screen.getByRole("dialog", { name: /post by/i })
}

// ── Tests ─────────────────────────────────────────────────────

describe("PostViewerProvider", () => {
    it("gives cards outside a provider nothing to open", () => {
        function Probe() {
            const viewer = usePostViewer()
            return <span>{viewer ? "list" : "none"}</span>
        }
        render(<Probe />)
        expect(screen.getByText("none")).toBeTruthy()
    })

    it("opens the list's viewer at the tapped post", () => {
        renderList()

        fireEvent.click(screen.getByRole("button", { name: "open p3" }))

        expect(viewerDialog().getAttribute("aria-label")).toBe("Post by Meera")
    })

    // Text-only posts have nothing to show full screen and are skipped over.
    it("walks the media posts only", () => {
        renderList()
        fireEvent.click(screen.getByRole("button", { name: "open p1" }))

        fireEvent.keyDown(document, { key: "ArrowDown" })

        expect(viewerDialog().getAttribute("aria-label")).toBe("Post by Meera")
    })

    it("shows the end slide once there is no next page", () => {
        renderList({ hasNextPage: false, endLabel: "Back to explore" })
        fireEvent.click(screen.getByRole("button", { name: "open p4" }))

        expect(screen.getByText("You're all caught up")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Back to explore" })).toBeTruthy()
    })

    it("lands the list on the last post viewed when the viewer closes", async () => {
        renderList()
        fireEvent.click(screen.getByRole("button", { name: "open p1" }))
        fireEvent.keyDown(document, { key: "ArrowDown" })   // → p3
        expect(viewerDialog().getAttribute("aria-label")).toBe("Post by Meera")

        fireEvent.keyDown(document, { key: "Escape" })

        await waitFor(() => expect(landOnPost).toHaveBeenCalledTimes(1))
        expect(landOnPost).toHaveBeenCalledWith("p3", { highlight: true })
        expect(screen.queryByRole("dialog", { name: /post by/i })).toBeNull()
        // The inline carousel of that post is told the slide too.
        expect(usePostViewerStore.getState().landings.p3).toEqual({ slide: 0 })
    })

    it("closes from the end slide's button and lands", async () => {
        renderList()
        fireEvent.click(screen.getByRole("button", { name: "open p4" }))

        fireEvent.click(screen.getByRole("button", { name: "Back to feed" }))

        await waitFor(() => expect(landOnPost).toHaveBeenCalledWith("p4", { highlight: true }))
    })

    // A link tap navigates away: the list is about to be gone, and landing
    // on it would scroll a page the reader is leaving.
    it("does not land when the viewer closed to follow a link", async () => {
        renderList()
        fireEvent.click(screen.getByRole("button", { name: "open p3" }))

        fireEvent.click(screen.getByRole("link", { name: /Meera/ }))

        await waitFor(() => expect(push).toHaveBeenCalledWith("/profile/meera"))
        expect(screen.queryByRole("dialog", { name: /post by/i })).toBeNull()
        expect(landOnPost).not.toHaveBeenCalled()
    })
})
