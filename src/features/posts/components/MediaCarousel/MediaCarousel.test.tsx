// @vitest-environment jsdom
/**
 * The feed tile: it just plays. No play button; the thumbnail until a frame is
 * really painted; a post with no thumbnail paints its own frame; warm and cold
 * follow the coordinator. Which video wins is playback.test.tsx.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PostMedia } from "@/features/posts/services/posts.api"
import { resetPlaybackForTests, suspendPlayback } from "@/shared/media/playback"
import {
    coming,
    FakeObserver,
    installFakeMedia,
    placeAt,
    see,
    settle,
    stubConnection,
    useFakePlaybackTimers,
} from "@/shared/media/playbackTestKit"
import { useSoundStore } from "@/store/sound.store"
import MediaCarousel from "./MediaCarousel"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

const video = (id: string, over: Partial<PostMedia> = {}): PostMedia =>
    ({
        id,
        media_type: "video",
        file_url: `https://cdn.test/${id}.mp4`,
        thumbnail_url: `https://cdn.test/${id}.jpg`,
        order: 0,
        duration: 72,
        width: 720,
        height: 1280,
        ...over,
    }) as PostMedia

const photo = (id: string): PostMedia =>
    ({
        id,
        media_type: "image",
        file_url: `https://cdn.test/${id}.full.jpg`,
        thumbnail_url: `https://cdn.test/${id}.jpg`,
        order: 0,
    }) as PostMedia

let media: ReturnType<typeof installFakeMedia>

/** Each as its own post, in order. Returns their <video> elements. */
function feed(...items: PostMedia[]) {
    const onOpen = vi.fn()
    render(
        <>
            {items.map((item) => (
                <MediaCarousel key={item.id} media={[item]} postId={item.id} onOpenViewer={onOpen} />
            ))}
        </>
    )
    return { onOpen, videos: Array.from(document.querySelectorAll("video")) }
}

const tileOf = (el: HTMLVideoElement) => el.closest("[data-video-tier]") as HTMLElement
const tier = (el: HTMLVideoElement) => tileOf(el).getAttribute("data-video-tier")

const startPlaying = (el: HTMLVideoElement) => {
    Object.defineProperty(el, "currentTime", { configurable: true, value: 0.5 })
    fireEvent.playing(el)
    fireEvent.timeUpdate(el)
}

beforeEach(() => {
    FakeObserver.instances = []
    vi.stubGlobal("IntersectionObserver", FakeObserver)
    media = installFakeMedia()
    useSoundStore.setState({ muted: true })
    useFakePlaybackTimers()
})

afterEach(() => {
    cleanup()
    resetPlaybackForTests()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe("no play button", () => {
    it("draws no play icon, playing or not", () => {
        const { videos } = feed(video("a"))
        expect(document.querySelector('[data-icon="mdi:play"]')).toBeNull()

        see(videos[0], 1)
        settle()
        expect(document.querySelector('[data-icon="mdi:play"]')).toBeNull()
    })

    it("a duration chip until it first plays, then gone for good", () => {
        const { videos } = feed(video("a"))
        expect(screen.getByText("1:12")).toBeTruthy()

        see(videos[0], 1)
        settle()
        startPlaying(videos[0])
        expect(screen.queryByText("1:12")).toBeNull()

        act(() => videos[0].pause())
        expect(screen.queryByText("1:12")).toBeNull()
    })

    it("autoplay refused: a corner glyph so it still reads as a video", async () => {
        const { videos } = feed(video("a"))
        media.play.mockImplementationOnce(async () => {
            throw Object.assign(new Error("no"), { name: "NotAllowedError" })
        })

        see(videos[0], 1)
        settle()
        await act(async () => {})

        expect(document.querySelector('[data-icon="mdi:video"]')).toBeTruthy()
        expect(document.querySelector('[data-icon="mdi:play"]')).toBeNull()
    })

    it("a tap opens the viewer, as ever", () => {
        const { onOpen } = feed(video("a"))
        fireEvent.click(screen.getByRole("button", { name: /View video 1 of 1 full screen/ }))
        expect(onOpen).toHaveBeenCalledWith(0)
    })
})

describe("never black", () => {
    it("the thumbnail waits for the look-ahead, then stays until a frame is painted", () => {
        const { videos } = feed(video("a"))
        const thumb = () => document.querySelector('img[src="https://cdn.test/a.jpg"]')
        expect(thumb()).toBeNull()

        coming(videos[0])
        expect(thumb()).toBeTruthy()
        expect(videos[0].hasAttribute("data-frame-shown")).toBe(false)

        see(videos[0], 1)
        settle()
        // Playing, but nothing on screen yet: `playing` alone is not a frame.
        fireEvent.playing(videos[0])
        expect(videos[0].hasAttribute("data-frame-shown")).toBe(false)

        startPlaying(videos[0])
        expect(videos[0].hasAttribute("data-frame-shown")).toBe(true)
        // Under the video, so the frame fades in over it rather than over nothing.
        expect(thumb()).toBeTruthy()
    })

    it("the skeleton shows until the thumbnail has loaded", () => {
        const { videos } = feed(video("a"))
        const tile = tileOf(videos[0])
        coming(videos[0])
        const skeletons = () => tile.querySelectorAll('[class*="mediaSkeleton"]').length
        expect(skeletons()).toBe(1)

        fireEvent.load(document.querySelector('img[src="https://cdn.test/a.jpg"]')!)
        expect(skeletons()).toBe(0)
    })

    it("uses the frame callback where there is one", () => {
        const callbacks: Array<() => void> = []
        Object.assign(HTMLVideoElement.prototype, {
            requestVideoFrameCallback: (cb: () => void) => callbacks.push(cb),
            cancelVideoFrameCallback: () => {},
        })
        const { videos } = feed(video("a"))
        see(videos[0], 1)
        settle()

        act(() => callbacks.forEach((cb) => cb()))
        expect(videos[0].hasAttribute("data-frame-shown")).toBe(true)

        delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).requestVideoFrameCallback
        delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).cancelVideoFrameCallback
    })

    it("no thumbnail: asks for #t=0.1 with metadata when close, and shows that frame", () => {
        const { videos } = feed(video("a", { thumbnail_url: null } as never))
        const el = videos[0]

        expect(el.src).toBe("https://cdn.test/a.mp4#t=0.1")
        // Nothing to fade in over.
        expect(el.hasAttribute("data-frame-shown")).toBe(true)
        expect(el.preload).toBe("none")

        coming(el)
        expect(el.preload).toBe("metadata")
        expect(media.load).toHaveBeenCalled()
    })

    it("no thumbnail under data saver: no fetch", () => {
        const undo = stubConnection({ saveData: true })
        const { videos } = feed(video("a", { thumbnail_url: null } as never))

        coming(videos[0])

        expect(videos[0].preload).toBe("none")
        undo()
    })
})

describe("the tiers on the tile", () => {
    it("next-1 auto, next-2 metadata, and both actually start loading", () => {
        const { videos } = feed(video("a"), video("b"), video("c"), video("d"))
        const [a, b, c, d] = videos
        coming(b)
        coming(c)
        coming(d)
        media.load.mockClear()

        see(a, 1)
        settle()

        expect([a, b, c, d].map(tier)).toEqual(["active", "warm-next", "warm-after", "cold"])
        expect([a, b, c, d].map((el) => el.preload)).toEqual(["auto", "auto", "metadata", "none"])
        const loaded = media.load.mock.contexts
        expect(loaded).toContain(b)
        expect(loaded).toContain(c)
        expect(loaded).not.toContain(d)
    })

    it("a cold tile keeps the URL but fetches nothing", () => {
        const { videos } = feed(video("a"))
        expect(videos[0].src).toBe("https://cdn.test/a.mp4")
        expect(videos[0].preload).toBe("none")
        expect(media.load).not.toHaveBeenCalled()
    })

    it("far away it gives the source back, and coming near attaches it again", () => {
        const { videos } = feed(video("a"), video("b"))
        const [a, b] = videos
        placeAt(b, window.innerHeight * 5)

        see(a, 1)
        settle()
        expect(tier(b)).toBe("released")
        expect(b.hasAttribute("src")).toBe(false)

        placeAt(b, 900)
        coming(b)
        settle()
        expect(b.src).toBe("https://cdn.test/b.mp4")
    })

    it("given back, the thumbnail is the tile again", () => {
        const { videos } = feed(video("a"), video("b"))
        const [a, b] = videos
        see(a, 1)
        settle()
        startPlaying(a)
        expect(a.hasAttribute("data-frame-shown")).toBe(true)

        placeAt(a, -window.innerHeight * 5)
        see(a, 0)
        see(b, 1)
        settle()

        expect(tier(a)).toBe("released")
        expect(a.hasAttribute("data-frame-shown")).toBe(false)
    })

    it("data saver: no video warms, the thumbnails still do", () => {
        const undo = stubConnection({ saveData: true })
        const { videos } = feed(video("a"), video("b"))
        const [a, b] = videos
        coming(b)
        media.load.mockClear()

        see(a, 1)
        settle()

        expect(tier(b)).toBe("cold")
        expect(b.preload).toBe("none")
        expect(media.load.mock.contexts).not.toContain(b)
        expect(document.querySelector('img[src="https://cdn.test/b.jpg"]')).toBeTruthy()
        undo()
    })

    it("a release on unmount frees the decoder", () => {
        const { videos } = feed(video("a"))
        const el = videos[0]

        cleanup()

        expect(el.hasAttribute("src")).toBe(false)
    })
})

describe("one mechanism", () => {
    it("a suspension pauses the tile with no prop involved, and lifting it resumes", () => {
        const { videos } = feed(video("a"))
        see(videos[0], 1)
        settle()
        expect(media.isPlaying(videos[0])).toBe(true)

        const release = suspendPlayback()
        expect(media.isPlaying(videos[0])).toBe(false)

        act(release)
        settle()
        expect(media.isPlaying(videos[0])).toBe(true)
    })

    it("the mute button shows while playing, and does not open the viewer", () => {
        const { videos, onOpen } = feed(video("a"))
        see(videos[0], 1)
        settle()

        fireEvent.click(screen.getByRole("button", { name: "Unmute video" }))

        expect(onOpen).not.toHaveBeenCalled()
        expect(useSoundStore.getState().muted).toBe(false)
        expect(videos[0].muted).toBe(false)
    })
})

describe("photos", () => {
    it("load about 1.5 screens ahead, and nothing tells the browser to wait again", () => {
        render(<MediaCarousel media={[photo("p")]} postId="p" onOpenViewer={vi.fn()} />)
        const observer = FakeObserver.instances.find((o) => o.options.rootMargin === "0px 0px 150% 0px")!
        expect(observer).toBeTruthy()
        expect(document.querySelector("img")).toBeNull()

        act(() => observer.fire([{ isIntersecting: true, target: [...observer.targets][0] }]))

        const img = document.querySelector("img")!
        expect(img.getAttribute("src")).toBe("https://cdn.test/p.jpg")
        expect(img.hasAttribute("loading")).toBe(false)
    })
})
