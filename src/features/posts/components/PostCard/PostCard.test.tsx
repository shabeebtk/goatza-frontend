// @vitest-environment jsdom

/**
 * PostCard — the one rule the full-screen viewer's text posts hang on: only
 * a photo or a video opens the viewer. A text-only card is reached by
 * swiping INSIDE the viewer, never by tapping the card, so the card must
 * offer nothing that opens it — not the article, not the words.
 *
 * Same mocks as PostViewer.test.tsx; see there for why.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import PostCard from "./PostCard"
import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
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
vi.mock("@/features/posts/components/PostComments/PostComments", () => ({ default: () => null }))

vi.mock("@/features/posts/hooks/usePostMutations", () => ({
    useToggleLike: () => ({ mutate: vi.fn(), isPending: false }),
    useToggleSave: () => ({ mutate: vi.fn(), isPending: false }),
}))

// The list's viewer, as a card inside a PostViewerProvider sees it.
const openListViewer = vi.fn()
vi.mock("@/features/posts/components/PostViewer/PostViewerProvider", () => ({
    usePostViewer: () => ({ open: openListViewer }),
}))

// The single-post fallback: mounting it at all would be the bug.
const singleViewer = vi.fn()
vi.mock("@/features/posts/components/PostViewer/PostViewer", () => ({
    default: (props: unknown) => {
        singleViewer(props)
        return <div role="dialog" aria-label="viewer" />
    },
}))

beforeEach(() => {
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
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

const TEXT_POST: Post = {
    id: "post-text",
    content: "Big win tonight #kochi",
    post_type: "general",
    visibility: "public",
    likes_count: 0,
    likes_breakdown: {},
    comments_count: 0,
    created_at: new Date().toISOString(),
    author: { id: "u2", username: "arjun", name: "Arjun", headline: "" },
    author_type: "user",
    media: [],
    sport: null,
    reaction: { is_reacted: false, type: null },
}

function renderCard(post: Post) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={qc}>
            <ToastProvider>
                <PostCard post={post} queryParams={{}} />
            </ToastProvider>
        </QueryClientProvider>
    )
}

describe("PostCard — text-only", () => {
    it("has nothing that opens the viewer", () => {
        renderCard(TEXT_POST)
        const card = document.querySelector('[data-post-id="post-text"]') as HTMLElement
        expect(card).toBeTruthy()

        // No media tile: those are the only role="button" elements a card has.
        expect(card.querySelectorAll('[role="button"]')).toHaveLength(0)

        // Tapping the card, the words or the hashtag opens nothing.
        fireEvent.click(card)
        fireEvent.click(screen.getByText(/Big win tonight/))
        fireEvent.click(card)
        fireEvent.click(card)
        fireEvent.doubleClick(card)

        expect(openListViewer).not.toHaveBeenCalled()
        expect(singleViewer).not.toHaveBeenCalled()
        expect(screen.queryByRole("dialog")).toBeNull()
    })
})
