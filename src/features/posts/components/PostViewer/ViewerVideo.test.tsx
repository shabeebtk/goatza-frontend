// @vitest-environment jsdom
/**
 * ViewerVideo's one-shot play: a reader's pause beats a clip still loading, and
 * only a refused autoplay may touch the app's sound.
 *
 * A real play() before any data has arrived flips `paused` to false at once and
 * leaves its promise waiting, and pause() rejects that promise with AbortError.
 * installFakeMedia settles straight away, so playStaysPending stands in for that.
 */

import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { createRef, useLayoutEffect, useRef, type RefObject } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PostMedia } from "@/features/posts/services/posts.api"
import { installFakeMedia } from "@/shared/media/playbackTestKit"
import { useSoundStore } from "@/store/sound.store"
import ViewerVideo, { type ViewerVideoApi } from "./ViewerVideo"

vi.mock("@iconify/react", () => ({
    Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

const CLIP: PostMedia = {
    id: "v1",
    media_type: "video",
    file_url: "https://cdn.test/1.mp4",
    thumbnail_url: "https://cdn.test/1.jpg",
    duration: 12,
    width: 720,
    height: 1280,
    order: 0,
}

let media: ReturnType<typeof installFakeMedia>

const named = (name: string) => Object.assign(new Error(name), { name })

/** The next play() rejects at once. */
function nextPlayRejects(name: string) {
    media.play.mockImplementationOnce(async () => {
        throw named(name)
    })
}

function playStaysPending() {
    const startPlay = media.play.getMockImplementation()!
    const doPause = media.pause.getMockImplementation()!
    let reject: (reason: Error) => void = () => {}
    media.play.mockImplementationOnce(function (this: HTMLMediaElement) {
        void startPlay.call(this)
        return new Promise<void>((_, rejectPlay) => {
            reject = rejectPlay
        })
    })
    media.pause.mockImplementation(function (this: HTMLMediaElement) {
        doPause.call(this)
        reject(named("AbortError"))
    })
}

function tree(apiRef: RefObject<ViewerVideoApi | null>, active: boolean) {
    return <ViewerVideo item={CLIP} apiRef={apiRef} controls="minimal" active={active} />
}

function mount(active = true) {
    const apiRef = createRef<ViewerVideoApi>()
    const view = render(tree(apiRef, active))
    return {
        apiRef,
        el: view.container.querySelector("video")!,
        setActive: (next: boolean) => view.rerender(tree(apiRef, next)),
    }
}

/** Lets a rejected play() reach its catch. */
const rejectionsLand = () => act(async () => {})

beforeEach(() => {
    media = installFakeMedia()
    useSoundStore.setState({ muted: true })
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe("a pause before the clip has loaded", () => {
    it("sticks: canplay does not restart it", async () => {
        playStaysPending()
        const { el, apiRef } = mount()
        expect(el.paused).toBe(false)

        act(() => apiRef.current!.togglePlay())
        await rejectionsLand()
        expect(el.paused).toBe(true)
        media.plays.length = 0

        fireEvent.canPlay(el)

        expect(media.plays).toEqual([])
        expect(el.paused).toBe(true)
    })

    it("playing it again is the reader's to do, and works", async () => {
        playStaysPending()
        const { el, apiRef } = mount()
        act(() => apiRef.current!.togglePlay())
        await rejectionsLand()

        act(() => apiRef.current!.togglePlay())

        expect(media.isPlaying(el)).toBe(true)
    })

    it("coming back to the page is a fresh start", async () => {
        playStaysPending()
        const { el, apiRef, setActive } = mount()
        act(() => apiRef.current!.togglePlay())
        await rejectionsLand()

        setActive(false)
        setActive(true)

        expect(media.isPlaying(el)).toBe(true)
    })
})

describe("an abort the reader did not cause", () => {
    it("re-arms the one-shot, so canplay still starts it", async () => {
        nextPlayRejects("AbortError")
        const { el } = mount()
        await rejectionsLand()
        expect(media.isPlaying(el)).toBe(false)

        fireEvent.canPlay(el)

        expect(media.isPlaying(el)).toBe(true)
    })

    it("does not outlast a seek: the reader has taken over", async () => {
        nextPlayRejects("AbortError")
        const { el, apiRef } = mount()
        await rejectionsLand()
        Object.defineProperty(el, "duration", { configurable: true, value: 30 })

        act(() => apiRef.current!.seekBy(5))
        fireEvent.canPlay(el)

        expect(media.isPlaying(el)).toBe(false)
    })

    it("a seek before the metadata does nothing, so it spends nothing", async () => {
        nextPlayRejects("AbortError")
        const { el, apiRef } = mount()
        await rejectionsLand()

        act(() => apiRef.current!.seekBy(5))
        fireEvent.canPlay(el)

        expect(media.isPlaying(el)).toBe(true)
    })
})

describe("the outgoing element", () => {
    // In a parent's layout effect: after this commit, before any passive effect,
    // which is the gap a late `canplay` used to slip through.
    function Swiped({ active, apiRef }: { active: boolean; apiRef: RefObject<ViewerVideoApi | null> }) {
        const wrap = useRef<HTMLDivElement>(null)
        useLayoutEffect(() => {
            if (!active) wrap.current!.querySelector("video")!.dispatchEvent(new Event("canplay"))
        }, [active])
        return <div ref={wrap}>{tree(apiRef, active)}</div>
    }

    it("reads as inactive before any media event can run", async () => {
        nextPlayRejects("AbortError")
        const apiRef = createRef<ViewerVideoApi>()
        const view = render(<Swiped active apiRef={apiRef} />)
        await rejectionsLand()
        media.plays.length = 0

        view.rerender(<Swiped active={false} apiRef={apiRef} />)

        expect(media.plays).toEqual([])
    })
})

describe("the spinner", () => {
    const spinner = () => document.querySelector("[data-media-loading]")
    /** Real timers: long enough for the spinner's 400 ms, and its fade out. */
    const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    const firstFrame = (el: HTMLVideoElement) => {
        Object.defineProperty(el, "currentTime", { configurable: true, value: 0.3 })
        fireEvent.timeUpdate(el)
    }

    it("the active element, with no first frame: yes, until the frame", async () => {
        const { el } = mount()
        await rejectionsLand()
        await wait(450)
        expect(spinner()).toBeTruthy()

        firstFrame(el)
        await wait(200)
        expect(spinner()).toBeNull()
    })

    it("the active element `waiting` mid-play: yes, until it plays again", async () => {
        const { el } = mount()
        await rejectionsLand()
        firstFrame(el)
        await wait(450)
        expect(spinner()).toBeNull()

        fireEvent.waiting(el)
        await wait(450)
        expect(spinner()).toBeTruthy()

        fireEvent.playing(el)
        await wait(200)
        expect(spinner()).toBeNull()
    })

    it("a warm element: never, whatever it reports", async () => {
        const { el } = mount(false)
        await rejectionsLand()

        fireEvent.waiting(el)
        fireEvent.stalled(el)
        await wait(450)

        expect(spinner()).toBeNull()
    })

    it("going warm takes it away", async () => {
        const { setActive } = mount()
        await rejectionsLand()
        await wait(450)
        expect(spinner()).toBeTruthy()

        setActive(false)
        await wait(200)

        expect(spinner()).toBeNull()
    })

    it("a clip the reader paused: none, and back when they play it", async () => {
        const { el, apiRef } = mount()
        await rejectionsLand()
        firstFrame(el)

        act(() => apiRef.current!.togglePlay())
        fireEvent.waiting(el)
        await wait(450)
        expect(spinner()).toBeNull()

        act(() => apiRef.current!.togglePlay())
        fireEvent.waiting(el)
        await wait(450)
        expect(spinner()).toBeTruthy()
    })

    it("a clip that has ended: none", async () => {
        const { el } = mount()
        await rejectionsLand()
        firstFrame(el)
        fireEvent.waiting(el)

        act(() => el.pause())
        fireEvent.ended(el)
        await wait(450)

        expect(spinner()).toBeNull()
    })

    it("an error: none, and it stays on its poster", async () => {
        const { el } = mount()
        await rejectionsLand()

        fireEvent.error(el)
        await wait(450)

        expect(spinner()).toBeNull()
        expect(document.querySelector("[data-viewer-poster]")).toBeTruthy()
    })

    it("a broken clip play() refused: none", async () => {
        nextPlayRejects("NotSupportedError")
        mount()
        await rejectionsLand()

        await wait(450)

        expect(spinner()).toBeNull()
    })

    it("refused even muted (Low Power Mode): none, it rests on its poster", async () => {
        media.play.mockImplementation(async () => {
            throw named("NotAllowedError")
        })
        mount()
        await rejectionsLand()

        await wait(450)

        expect(spinner()).toBeNull()
        expect(document.querySelector("[data-viewer-poster]")).toBeTruthy()
    })
})

describe("what a rejected play() means", () => {
    it("NotSupportedError: the sound store is not touched and nothing retries", async () => {
        useSoundStore.setState({ muted: false })
        nextPlayRejects("NotSupportedError")
        const { el } = mount()
        await rejectionsLand()

        expect(useSoundStore.getState().muted).toBe(false)
        expect(el.muted).toBe(false)
        expect(media.play).toHaveBeenCalledTimes(1)
        expect(media.isPlaying(el)).toBe(false)
        expect(document.querySelector("[data-viewer-poster]")).toBeTruthy()
    })

    it("a source that fails under a pending play() ends paused too", async () => {
        const startPlay = media.play.getMockImplementation()!
        media.play.mockImplementationOnce(function (this: HTMLMediaElement) {
            void startPlay.call(this)
            return Promise.reject(named("NotSupportedError"))
        })
        const { el } = mount()
        await rejectionsLand()

        expect(el.paused).toBe(true)
    })

    it("NotAllowedError: muted, retried, and the whole app moved", async () => {
        useSoundStore.setState({ muted: false })
        nextPlayRejects("NotAllowedError")
        const { el } = mount()
        await rejectionsLand()

        expect(useSoundStore.getState().muted).toBe(true)
        expect(el.muted).toBe(true)
        expect(media.play).toHaveBeenCalledTimes(2)
        expect(media.isPlaying(el)).toBe(true)
    })
})
