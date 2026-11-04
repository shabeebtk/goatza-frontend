// @vitest-environment jsdom
/**
 * The viewer's warm neighbours: real paused <video> elements around the active
 * post, the SAME element playing once its page is active, a poster until the
 * first frame, and only the active one ever playing.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Post, PostMedia } from "@/features/posts/services/posts.api"
import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
import { installPlaybackGuard, resetPlaybackForTests } from "@/shared/media/playback"
import { FakeObserver, installFakeMedia, stubConnection } from "@/shared/media/playbackTestKit"
import { useSoundStore } from "@/store/sound.store"
import PostViewer from "./PostViewer"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/shared/services/navigation.service", () => ({
    useNavigation: () => ({ toProfile: (u: string) => `/profile/${u}`, toSearch: () => "/search" }),
}))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
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

const clip = (n: string, over: Partial<PostMedia> = {}): PostMedia => ({
    id: `v${n}`,
    media_type: "video",
    file_url: `https://cdn.test/${n}.mp4`,
    thumbnail_url: `https://cdn.test/${n}.jpg`,
    duration: 12,
    width: 720,
    height: 1280,
    order: 0,
    ...over,
})

const makePost = (n: string, media: PostMedia[] = [clip(n)]): Post => ({
    id: `p${n}`,
    content: `Post ${n}`,
    post_type: "general",
    visibility: "public",
    likes_count: 0,
    likes_breakdown: {},
    comments_count: 0,
    created_at: new Date().toISOString(),
    author: { id: "u1", username: "riya", name: "Riya", headline: "" },
    author_type: "user",
    media,
    sport: null,
    reaction: { is_reacted: false, type: null },
}) as Post

let media: ReturnType<typeof installFakeMedia>

function open(posts: Post[], initialPostId: string) {
    const qc = new QueryClient()
    return render(
        <QueryClientProvider client={qc}>
            <ToastProvider>
                <PostViewer posts={posts} initialPostId={initialPostId} onClose={vi.fn()} />
            </ToastProvider>
        </QueryClientProvider>
    )
}

const page = (n: string) => document.querySelector<HTMLElement>(`[data-viewer-post="p${n}"]`)!
const videoOf = (n: string) => page(n).querySelector("video")
const videos = () => Array.from(document.querySelectorAll("video"))

/** Reports a page as the one on screen, the way the reels layout's observer would. */
function swipeTo(n: string) {
    const observer = FakeObserver.instances.find((o) => o.options.root)!
    act(() =>
        observer.fire([{ target: page(n), isIntersecting: true, intersectionRatio: 0.9 }])
    )
}

beforeEach(() => {
    FakeObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    installMatchMedia(false)
    media = installFakeMedia()
    installPlaybackGuard()
    useSoundStore.setState({ muted: true })
})

afterEach(() => {
    cleanup()
    resetPlaybackForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState(null, "")
    // @ts-expect-error — put jsdom back the way it was found.
    delete window.matchMedia
})

describe("warm neighbours on a phone", () => {
    const five = ["1", "2", "3", "4", "5", "6"].map((n) => makePost(n))

    it("next two and previous one hold a real, paused element; the rest are stills", () => {
        open(five, "p3")

        expect(videoOf("3")!.getAttribute("data-viewer-video")).toBe("active")
        expect(videoOf("4")!.getAttribute("data-viewer-video")).toBe("warm")
        expect(videoOf("5")!.getAttribute("data-viewer-video")).toBe("warm")
        expect(videoOf("2")!.getAttribute("data-viewer-video")).toBe("warm")
        // In the render window, but outside the plan: a still.
        expect(videoOf("1")).toBeNull()
        expect(page("1").querySelector("img")).toBeTruthy()
        // Outside the render window: a placeholder.
        expect(page("6").childElementCount).toBe(0)
    })

    it("next-1 preloads auto, next-2 and previous metadata", () => {
        open(five, "p3")

        expect(videoOf("4")!.preload).toBe("auto")
        expect(videoOf("5")!.preload).toBe("metadata")
        expect(videoOf("2")!.preload).toBe("metadata")
    })

    it("a warm element has its source and draws no chrome", () => {
        open(five, "p3")
        const warm = videoOf("4")!

        expect(warm.src).toBe("https://cdn.test/4.mp4")
        expect(warm.muted).toBe(true)
        expect(warm.hasAttribute("autoplay")).toBe(false)
        expect(warm.parentElement!.querySelector('[class*="progress"]')).toBeNull()
    })

    it("at most 4 hold a source", () => {
        open(five, "p3")
        expect(videos().filter((v) => v.hasAttribute("src"))).toHaveLength(4)
    })

    it("a warm element's canplay does not start it", () => {
        open(five, "p3")
        const warm = videoOf("4")!
        media.plays.length = 0

        fireEvent.canPlay(warm)

        expect(media.plays).not.toContain(warm)
    })

    it("only the active one plays", () => {
        open(five, "p3")
        expect(media.playingOf(videos())).toEqual([videoOf("3")])
    })

    it("activating a warm page plays the SAME element, no remount", () => {
        open(five, "p3")
        const warm = videoOf("4")!

        swipeTo("4")

        expect(videoOf("4")).toBe(warm)
        expect(warm.getAttribute("data-viewer-video")).toBe("active")
        expect(media.playingOf(videos())).toEqual([warm])
    })

    it("the one it left goes warm again: paused, muted, and still the same element", () => {
        open(five, "p3")
        const first = videoOf("3")!

        swipeTo("4")

        expect(videoOf("3")).toBe(first)
        expect(first.getAttribute("data-viewer-video")).toBe("warm")
        expect(media.isPlaying(first)).toBe(false)
        expect(first.muted).toBe(true)
    })

    it("swiping back starts it over", () => {
        open(five, "p3")
        const first = videoOf("3")!
        Object.defineProperty(first, "readyState", { configurable: true, value: 4 })
        first.currentTime = 5

        swipeTo("4")
        expect(first.currentTime).toBe(0)

        swipeTo("3")
        expect(media.isPlaying(first)).toBe(true)
    })

    it("leaving the window releases the source and leaves a still", () => {
        open(five, "p3")
        const second = videoOf("2")!

        swipeTo("4")

        expect(second.hasAttribute("src")).toBe(false)
        expect(videoOf("2")).toBeNull()
        expect(page("2").querySelector("img")).toBeTruthy()
    })

    it("the mute button drives the active element only", () => {
        useSoundStore.setState({ muted: false })
        open(five, "p3")

        expect(videoOf("3")!.muted).toBe(false)
        expect(videoOf("4")!.muted).toBe(true)
    })

    it("sound follows the reader onto the page they swipe to", () => {
        useSoundStore.setState({ muted: false })
        open(five, "p3")

        swipeTo("4")

        expect(videoOf("4")!.muted).toBe(false)
    })

    it("refused with sound: muted, retried, and the store moved", async () => {
        useSoundStore.setState({ muted: false })
        open(five, "p3")
        media.play.mockImplementationOnce(async () => {
            throw Object.assign(new Error("no"), { name: "NotAllowedError" })
        })

        swipeTo("4")
        await act(async () => {})

        expect(useSoundStore.getState().muted).toBe(true)
        expect(media.isPlaying(videoOf("4")!)).toBe(true)
    })

    it("data saver: nothing warms", () => {
        const undo = stubConnection({ saveData: true })
        open(five, "p3")

        expect(videos()).toEqual([videoOf("3")])
        undo()
    })

    it("within the post, the next slide is warm", () => {
        const multi = makePost("1", [clip("a"), clip("b", { order: 1 })])
        open([multi], "p1")

        expect(document.querySelector('video[data-viewer-video="warm"]')!.getAttribute("src")).toBe(
            "https://cdn.test/b.mp4"
        )
    })

    it("a photo slide is never fetched as a video, or a video as a photo", () => {
        const created: string[] = []
        const RealImage = window.Image
        vi.stubGlobal(
            "Image",
            class extends RealImage {
                set src(value: string) {
                    created.push(value)
                }
            }
        )
        open(five, "p3")

        expect(created.filter((url) => url.endsWith(".mp4"))).toEqual([])
    })
})

describe("poster first", () => {
    const one = () => [makePost("1")]
    const poster = () => document.querySelector("[data-viewer-poster]")

    it("the poster sits over the video until a frame is painted", () => {
        open(one(), "p1")
        const el = videos()[0]

        expect(poster()!.getAttribute("src")).toBe("https://cdn.test/1.jpg")

        fireEvent.canPlay(el)
        fireEvent.playing(el)
        expect(poster()).toBeTruthy()

        Object.defineProperty(el, "currentTime", { configurable: true, value: 0.3 })
        fireEvent.timeUpdate(el)
        expect(poster()).toBeNull()
    })

    it("a blurred copy behind both, for good", () => {
        open(one(), "p1")
        const el = videos()[0]
        Object.defineProperty(el, "currentTime", { configurable: true, value: 0.3 })
        fireEvent.timeUpdate(el)

        const ambient = page("1").querySelector('img[class*="ambient"]')
        expect(ambient!.getAttribute("src")).toBe("https://cdn.test/1.jpg")
    })

    it("no thumbnail: no poster layer, and the source asks for a frame", () => {
        open([makePost("1", [clip("1", { thumbnail_url: null } as never)])], "p1")

        expect(poster()).toBeNull()
        expect(videos()[0].src).toBe("https://cdn.test/1.mp4#t=0.1")
    })
})

describe("the feed underneath", () => {
    it("the tap flash and the keyboard still reach the active video", () => {
        open([makePost("1")], "p1")
        const el = videos()[0]

        fireEvent.keyDown(document, { key: " " })

        expect(media.isPlaying(el)).toBe(false)
        expect(document.querySelector('[data-icon="mdi:pause"]')).toBeTruthy()
    })
})

describe("desktop", () => {
    beforeEach(() => installMatchMedia(true))

    it("keeps the next post's first video warm in the stage, and moves on to that element", () => {
        open([makePost("1"), makePost("2"), makePost("3")], "p1")
        const all = videos()
        expect(all).toHaveLength(2)
        const warm = all.find((v) => v.getAttribute("data-viewer-video") === "warm")!
        expect(warm.src).toBe("https://cdn.test/2.mp4")
        expect(warm.closest('[aria-hidden="true"]')).toBeTruthy()

        fireEvent.keyDown(document, { key: "ArrowDown" })

        expect(warm.isConnected).toBe(true)
        expect(warm.getAttribute("data-viewer-video")).toBe("active")
        expect(warm.closest('[aria-hidden="true"]')).toBeNull()
        expect(media.playingOf(videos())).toEqual([warm])
    })

    it("keeps the next slide warm", () => {
        open([makePost("1", [clip("a"), clip("b", { order: 1 })])], "p1")

        const warm = videos().find((v) => v.getAttribute("data-viewer-video") === "warm")!
        expect(warm.src).toBe("https://cdn.test/b.mp4")
    })

    it("draws one control bar, the active video's", () => {
        open([makePost("1"), makePost("2")], "p1")
        expect(document.querySelectorAll('input[aria-label="Seek"]')).toHaveLength(1)
    })
})
