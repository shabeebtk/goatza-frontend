// @vitest-environment jsdom

/**
 * usePostMutations — one post, every cache.
 *
 * The same post can sit in the home feed, Explore, a profile list, Saved,
 * Mentions and a search at once, and every one of those lists now opens the
 * full-screen viewer, which renders the cache object it is handed. A like
 * that reached three of the six caches looked like it had not worked on the
 * other three until they refetched. POST_CACHE_KEYS is the list; these pin
 * that the mutations walk all of it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query"
import type { ReactNode } from "react"

import {
    POST_CACHE_KEYS,
    removePostFromAllLists,
    updatePostInAllLists,
    useDeletePost,
    useToggleLike,
} from "./usePostMutations"
import type { Post } from "../services/posts.api"

const toggleLikeApi = vi.fn()
const deletePostApi = vi.fn()
vi.mock("../services/posts.api", () => ({
    toggleLikeApi: (...args: unknown[]) => toggleLikeApi(...args),
    deletePostApi: (...args: unknown[]) => deletePostApi(...args),
}))

// ── Fixtures ──────────────────────────────────────────────────

function makePost(id: string): Post {
    return {
        id,
        content: `Post ${id}`,
        post_type: "general",
        visibility: "public",
        likes_count: 2,
        likes_breakdown: { like: 2 },
        comments_count: 0,
        created_at: new Date().toISOString(),
        author: { id: "u1", username: "riya", name: "Riya", headline: "" },
        author_type: "user",
        media: [],
        sport: null,
        reaction: { is_reacted: false, type: null },
    }
}

type Pages = InfiniteData<{ results: Post[]; next_cursor?: string | null }>

/** One concrete key per prefix in POST_CACHE_KEYS, shaped like the real hooks'. */
const CACHE_KEYS: Record<string, readonly unknown[]> = {
    list: ["posts", "list", { username: "riya", limit: 10 }],
    feed: ["posts", "feed"],
    mentions: ["posts", "mentions", "my", "user", null],
    saved: ["posts", "saved", "user", null],
    homeFeed: ["feed", "list", "user:u1"],
    explore: ["explore", "posts"],
    search: ["search", "posts", "riya"],
}

function seed(qc: QueryClient, post: Post) {
    for (const key of Object.values(CACHE_KEYS)) {
        qc.setQueryData<Pages>([...key], {
            pages: [{ results: [makePost("other"), post], next_cursor: null }],
            pageParams: [undefined],
        })
    }
}

function postIn(qc: QueryClient, key: readonly unknown[], id: string): Post | undefined {
    return qc.getQueryData<Pages>([...key])?.pages.flatMap((p) => p.results).find((p) => p.id === id)
}

let qc: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
)

beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

afterEach(() => {
    qc.clear()
    vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────

describe("POST_CACHE_KEYS", () => {
    it("covers every list that opens the viewer", () => {
        expect(POST_CACHE_KEYS).toEqual([
            ["posts", "list"],
            ["posts", "feed"],
            ["posts", "mentions"],
            ["posts", "saved"],
            ["feed", "list"],
            ["explore", "posts"],
            ["search", "posts"],
        ])
    })
})

describe("useToggleLike", () => {
    it("updates the post in the saved, mentions and search caches — and the rest", async () => {
        const post = makePost("p1")
        seed(qc, post)
        toggleLikeApi.mockResolvedValue({ is_reacted: true, type: "like" })

        const { result } = renderHook(() => useToggleLike(), { wrapper })
        act(() => result.current.mutate({ post_id: "p1", type: "like" }))

        await waitFor(() => {
            expect(postIn(qc, CACHE_KEYS.saved, "p1")?.reaction.is_reacted).toBe(true)
        })
        for (const [name, key] of Object.entries(CACHE_KEYS)) {
            const liked = postIn(qc, key, "p1")
            expect(liked?.reaction, name).toEqual({ is_reacted: true, type: "like" })
            expect(liked?.likes_count, name).toBe(3)
            expect(liked?.likes_breakdown, name).toEqual({ like: 3 })
            // The other post is untouched — same reference, so its card
            // does not re-render.
            expect(postIn(qc, key, "other")?.reaction.is_reacted, name).toBe(false)
        }
        // A page's own fields survive the update.
        expect(qc.getQueryData<Pages>([...CACHE_KEYS.search])?.pages[0].next_cursor).toBeNull()
    })
})

describe("useDeletePost", () => {
    it("drops the post from every cache", async () => {
        seed(qc, makePost("p1"))
        deletePostApi.mockResolvedValue({})

        const { result } = renderHook(() => useDeletePost({}), { wrapper })
        act(() => result.current.mutate("p1"))

        await waitFor(() => expect(postIn(qc, CACHE_KEYS.saved, "p1")).toBeUndefined())
        for (const [name, key] of Object.entries(CACHE_KEYS)) {
            expect(postIn(qc, key, "p1"), name).toBeUndefined()
            expect(postIn(qc, key, "other"), name).toBeTruthy()
        }
    })
})

describe("cache helpers", () => {
    it("update leaves untouched posts by reference and keeps page fields", () => {
        const post = makePost("p1")
        seed(qc, post)
        const before = postIn(qc, CACHE_KEYS.explore, "other")

        updatePostInAllLists(qc, "p1", (p) => ({ ...p, comments_count: 9 }))

        expect(postIn(qc, CACHE_KEYS.explore, "p1")?.comments_count).toBe(9)
        expect(postIn(qc, CACHE_KEYS.explore, "other")).toBe(before)
        expect(qc.getQueryData<Pages>([...CACHE_KEYS.explore])?.pageParams).toEqual([undefined])
    })

    it("remove takes the post out of every cache and nothing else", () => {
        seed(qc, makePost("p1"))

        removePostFromAllLists(qc, "p1")

        for (const key of Object.values(CACHE_KEYS)) {
            expect(qc.getQueryData<Pages>([...key])?.pages[0].results.map((p) => p.id)).toEqual(["other"])
        }
    })
})
