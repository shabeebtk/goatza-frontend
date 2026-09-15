// @vitest-environment jsdom

/**
 * FeedList — what happens to the list when a page fails.
 *
 * React Query sets `isError` for a failed fetchNextPage too, and the list
 * used to answer every `isError` with its full error state: the cards, the
 * PostViewerProvider and any open viewer unmounted together, leaving the
 * viewer's history entry behind. The first page failing is the only time
 * the wall is right.
 *
 * Same mocks and matchMedia stub as PostViewer.test.tsx; see there for why.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import FeedList from "./FeedList"
import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
import { useSoundStore } from "@/store/sound.store"
import { usePostViewerStore } from "@/store/postViewer.store"
import type { Post } from "@/features/posts/services/posts.api"

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

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
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

vi.mock("../../hooks/useImpressionTracker", () => ({
    useImpressionTracker: () => ({ getPostRef: () => () => {}, markSeen: vi.fn() }),
}))

// The query, as the list sees it. Each test sets what it needs; the mock
// reads it on every render so a rerender picks up the change.
type FeedState = {
    data: { pages: { results: Post[] }[] } | undefined
    isLoading: boolean
    isError: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    hasNextPage: boolean
    fetchNextPage: ReturnType<typeof vi.fn>
}
let feed: FeedState
vi.mock("../../hooks/useFeedQueries", () => ({
    useFeedList: () => feed,
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

class FakeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

beforeEach(() => {
    installMatchMedia()
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve())
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
    useSoundStore.setState({ muted: true })
    usePostViewerStore.setState({ landings: {}, open: false })
    feed = {
        data: undefined,
        isLoading: false,
        isError: false,
        isFetchingNextPage: false,
        isFetchNextPageError: false,
        hasNextPage: true,
        fetchNextPage: vi.fn(() => Promise.resolve()),
    }
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState(null, "")
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

// ── Fixtures ──────────────────────────────────────────────────

function makePost(id: string, author: string): Post {
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
        media: [
            {
                id: `${id}-m0`,
                media_type: "image",
                file_url: `https://media.goatza.test/${id}/0.webp`,
                thumbnail_url: `https://media.goatza.test/${id}/0-thumb.webp`,
                duration: null,
                width: 1080,
                height: 1350,
                order: 0,
            },
        ],
        sport: null,
        reaction: { is_reacted: false, type: null },
    }
}

function renderFeed() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const tree = () => (
        <QueryClientProvider client={qc}>
            <ToastProvider>
                <FeedList />
            </ToastProvider>
        </QueryClientProvider>
    )
    const utils = render(tree())
    return { ...utils, rerenderFeed: () => utils.rerender(tree()) }
}

const cards = () => document.querySelectorAll("article[data-post-id]")

// ── Tests ─────────────────────────────────────────────────────

describe("FeedList", () => {
    it("shows the full error state when the FIRST page failed", () => {
        feed.isError = true
        renderFeed()

        expect(screen.getByText("Failed to load feed.")).toBeTruthy()
        expect(cards()).toHaveLength(0)
    })

    it("keeps the list and an open viewer when a NEXT page fails, with an inline retry", () => {
        feed.data = { pages: [{ results: [makePost("p1", "Riya"), makePost("p2", "Meera")] }] }
        const { rerenderFeed } = renderFeed()
        expect(cards()).toHaveLength(2)

        // Open the viewer from the first card's media tile.
        fireEvent.click(screen.getAllByRole("button", { name: /full screen/i })[0])
        expect(screen.getByRole("dialog", { name: "Post by Riya" })).toBeTruthy()

        // The next page fails under it.
        feed.isError = true
        feed.isFetchNextPageError = true
        rerenderFeed()

        expect(screen.getByRole("dialog", { name: "Post by Riya" })).toBeTruthy()
        expect(cards()).toHaveLength(2)
        expect(screen.queryByText("Failed to load feed.")).toBeNull()

        // The viewer's tail and the list's row both say so; the list's row
        // is the one outside the dialog.
        const rows = screen.getAllByRole("alert")
        const listRow = rows.find((row) => !row.closest("[role='dialog']"))!
        expect(listRow.textContent).toContain("Couldn't load more posts")

        fireEvent.click(listRow.querySelector("button")!)
        expect(feed.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false })
    })

    // The variety pattern can hand a post back twice across pages.
    it("renders a post that came back twice once", () => {
        const twice = makePost("p1", "Riya")
        feed.data = { pages: [{ results: [twice] }, { results: [twice, makePost("p2", "Meera")] }] }
        renderFeed()

        expect(cards()).toHaveLength(2)
    })
})
