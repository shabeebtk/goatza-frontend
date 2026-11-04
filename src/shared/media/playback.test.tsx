// @vitest-environment jsdom
/**
 * One player at a time: the guard, the election, suspension and the tiers.
 *
 * The observers and the media stack are fakes (playbackTestKit), so these drive
 * the same callbacks a browser would. Module state lives between tests, hence
 * resetPlaybackForTests.
 */

import { act, cleanup, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSoundStore } from "@/store/sound.store"
import {
    currentWinnerId,
    firstFrameSrc,
    installPlaybackGuard,
    lookAheadTarget,
    PLAYBACK_EXEMPT_ATTR,
    preloadForTier,
    prefersReducedData,
    releaseVideoElement,
    resetPlaybackForTests,
    suspendPlayback,
    useAutoplayVideo,
    useSuspendPlayback,
    whenFirstFrame,
} from "./playback"
import {
    coming,
    FakeObserver,
    installFakeMedia,
    placeAt,
    see,
    settle,
    stubConnection,
    stubDocumentHidden,
    useFakePlaybackTimers,
} from "./playbackTestKit"

let media: ReturnType<typeof installFakeMedia>

function Tile({ id, enabled = true }: { id: string; enabled?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null)
    const state = useAutoplayVideo(ref, { id, enabled })
    return (
        <video
            ref={ref}
            data-testid={id}
            data-tier={state.tier}
            data-preload={state.preload}
            data-blocked={state.blocked ? "" : undefined}
            muted
        />
    )
}

function tiles(...ids: string[]) {
    render(
        <>
            {ids.map((id) => (
                <Tile key={id} id={id} />
            ))}
        </>
    )
    return ids.map((id) => screen.getByTestId(id) as HTMLVideoElement)
}

const tier = (el: HTMLElement) => el.getAttribute("data-tier")

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
    document.body.innerHTML = ""
})

describe("the guard", () => {
    const videos = (count: number) =>
        Array.from({ length: count }, () => document.body.appendChild(document.createElement("video")))

    it("playing B pauses A", async () => {
        installPlaybackGuard()
        const [a, b] = videos(2)

        await a.play()
        await b.play()

        expect(media.isPlaying(a)).toBe(false)
        expect(media.isPlaying(b)).toBe(true)
    })

    it("pauses audio too", async () => {
        installPlaybackGuard()
        const [video] = videos(1)
        const audio = document.body.appendChild(document.createElement("audio"))

        await audio.play()
        await video.play()

        expect(media.isPlaying(audio)).toBe(false)
    })

    it("leaves a data-playback-exempt element alone", async () => {
        installPlaybackGuard()
        const [ambient, b] = videos(2)
        ambient.setAttribute(PLAYBACK_EXEMPT_ATTR, "")

        await ambient.play()
        await b.play()

        expect(media.isPlaying(ambient)).toBe(true)
        expect(media.isPlaying(b)).toBe(true)
    })

    it("an exempt element starting pauses nothing", async () => {
        installPlaybackGuard()
        const [a, ambient] = videos(2)
        ambient.setAttribute(PLAYBACK_EXEMPT_ATTR, "")

        await a.play()
        await ambient.play()

        expect(media.isPlaying(a)).toBe(true)
    })

    it("installs once", async () => {
        const add = vi.spyOn(document, "addEventListener")
        installPlaybackGuard()
        installPlaybackGuard()
        expect(add.mock.calls.filter(([type]) => type === "play")).toHaveLength(1)
    })
})

describe("the election", () => {
    it("the most visible wins", () => {
        const [a, b] = tiles("a", "b")

        see(a, 0.7)
        see(b, 0.9)
        settle()

        expect(currentWinnerId()).toBe("b")
        expect(media.playingOf([a, b])).toEqual([b])
    })

    it("needs 60%", () => {
        const [a] = tiles("a")

        see(a, 0.55)
        settle()
        expect(media.plays).toEqual([])

        see(a, 0.6)
        settle()
        expect(media.plays).toEqual([a])
    })

    it("a tie goes to the one nearest the viewport's centre", () => {
        const [a, b] = tiles("a", "b")
        placeAt(a, 600)
        placeAt(b, 250)

        see(a, 1)
        see(b, 1)
        settle()

        expect(currentWinnerId()).toBe("b")
    })

    it("only ever one: a new winner takes over from the old", () => {
        const [a, b] = tiles("a", "b")

        see(a, 1)
        settle()
        expect(media.playingOf([a, b])).toEqual([a])

        see(a, 0.7)
        see(b, 0.9)
        settle()
        expect(media.playingOf([a, b])).toEqual([b])
    })

    it("a video leaving the screen stops at once, without waiting for a successor", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        see(a, 0.2)
        act(() => {
            vi.advanceTimersByTime(20)
        })

        expect(media.isPlaying(a)).toBe(false)
    })

    it("a fling starts nothing it flies past", () => {
        const [a, b, c] = tiles("a", "b", "c")

        see(a, 1)
        act(() => {
            vi.advanceTimersByTime(100)
        })
        see(a, 0)
        see(b, 1)
        act(() => {
            vi.advanceTimersByTime(100)
        })
        see(b, 0)
        see(c, 1)
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(media.plays).toEqual([])

        settle()
        expect(media.plays).toEqual([c])
    })

    it("a disabled video does not stand", () => {
        render(<Tile id="a" enabled={false} />)
        const a = screen.getByTestId("a") as HTMLVideoElement

        see(a, 1)
        settle()

        expect(media.plays).toEqual([])
    })

    it("a clip taller than the screen can win by filling it", () => {
        const [a] = tiles("a")

        act(() => {
            const observer = FakeObserver.instances.find((o) => o.options.threshold)!
            observer.fire([
                {
                    target: a,
                    isIntersecting: true,
                    intersectionRatio: 0.45,
                    rootBounds: { height: 400 } as DOMRectReadOnly,
                    intersectionRect: { height: 400 } as DOMRectReadOnly,
                },
            ])
        })
        settle()

        expect(currentWinnerId()).toBe("a")
    })
})

describe("the sound policy", () => {
    it("plays with the global state on the property", () => {
        useSoundStore.setState({ muted: false })
        const [a] = tiles("a")

        see(a, 1)
        settle()

        expect(a.muted).toBe(false)
    })

    it("refused with sound: drops to muted, retries, and moves the store", async () => {
        useSoundStore.setState({ muted: false })
        const [a] = tiles("a")
        media.play.mockImplementationOnce(async () => {
            throw Object.assign(new Error("no"), { name: "NotAllowedError" })
        })

        see(a, 1)
        settle()
        await act(async () => {})

        expect(useSoundStore.getState().muted).toBe(true)
        expect(a.muted).toBe(true)
        expect(media.isPlaying(a)).toBe(true)
        expect(a.hasAttribute("data-blocked")).toBe(false)
    })

    it("refused even muted (Low Power Mode): reports blocked", async () => {
        const [a] = tiles("a")
        media.play.mockImplementationOnce(async () => {
            throw Object.assign(new Error("no"), { name: "NotAllowedError" })
        })

        see(a, 1)
        settle()
        await act(async () => {})

        expect(a.hasAttribute("data-blocked")).toBe(true)
    })

    it("an interrupted play() is not a refusal", async () => {
        const [a] = tiles("a")
        media.play.mockImplementationOnce(async () => {
            throw Object.assign(new Error("interrupted"), { name: "AbortError" })
        })

        see(a, 1)
        settle()
        await act(async () => {})

        expect(a.hasAttribute("data-blocked")).toBe(false)
    })
})

describe("suspension", () => {
    function Composer({ active = true }: { active?: boolean }) {
        useSuspendPlayback(active)
        return null
    }

    it("a composer mounting pauses the winner, and unmounting resumes it", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        const { unmount } = render(<Composer />)
        expect(media.isPlaying(a)).toBe(false)

        unmount()
        settle()
        expect(media.isPlaying(a)).toBe(true)
    })

    it("nothing starts while suspended", () => {
        const [a] = tiles("a")
        const release = suspendPlayback()

        see(a, 1)
        settle()
        expect(media.plays).toEqual([])

        act(release)
        settle()
        expect(media.plays).toEqual([a])
    })

    it("is counted", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        const first = suspendPlayback()
        const second = suspendPlayback()
        act(first)
        settle()
        expect(media.isPlaying(a)).toBe(false)

        act(second)
        settle()
        expect(media.isPlaying(a)).toBe(true)
    })

    it("releasing twice counts once", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        const first = suspendPlayback()
        const second = suspendPlayback()
        act(first)
        act(first)
        settle()
        expect(media.isPlaying(a)).toBe(false)
        act(second)
    })

    it("the composer handing over to the upload screen lets nothing through", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()
        const composer = suspendPlayback()

        let screenRelease = () => {}
        act(() => {
            composer()
            screenRelease = suspendPlayback()
        })
        settle()
        expect(media.isPlaying(a)).toBe(false)

        act(screenRelease)
        settle()
        expect(media.isPlaying(a)).toBe(true)
    })

    it("does not resume a video the reader paused", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        // Not through us: the OS media controls, say.
        act(() => a.pause())

        const release = suspendPlayback()
        act(release)
        settle()
        expect(media.isPlaying(a)).toBe(false)
    })

    it("off the screen and back is a fresh start", () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()
        act(() => a.pause())

        see(a, 0)
        settle()
        see(a, 1)
        settle()

        expect(media.isPlaying(a)).toBe(true)
    })

    it("a video another player displaced does not come back and pause it", async () => {
        const [a] = tiles("a")
        see(a, 1)
        settle()

        const other = document.body.appendChild(document.createElement("video"))
        await act(async () => {
            await other.play()
        })
        expect(media.isPlaying(a)).toBe(false)

        see(a, 0.95)
        settle()
        expect(media.isPlaying(a)).toBe(false)
        expect(media.isPlaying(other)).toBe(true)
    })

    it("pauses while the document is hidden, and resumes when visible", () => {
        const setHidden = stubDocumentHidden()
        const [a] = tiles("a")
        see(a, 1)
        settle()

        setHidden(true)
        expect(media.isPlaying(a)).toBe(false)

        setHidden(false)
        settle()
        expect(media.isPlaying(a)).toBe(true)

        delete (document as unknown as { hidden?: boolean }).hidden
    })

    it("the OS pausing just before the tab hides is not the reader", () => {
        const setHidden = stubDocumentHidden()
        const [a] = tiles("a")
        see(a, 1)
        settle()

        act(() => a.pause())
        setHidden(true)
        setHidden(false)
        settle()

        expect(media.isPlaying(a)).toBe(true)
        delete (document as unknown as { hidden?: boolean }).hidden
    })
})

describe("tiers", () => {
    const elect = (el: HTMLVideoElement) => {
        see(el, 1)
        settle()
    }

    it("the winner, then the next two, then cold", () => {
        const [a, b, c, d] = tiles("a", "b", "c", "d")
        coming(b)
        coming(c)
        coming(d)
        elect(a)

        expect([a, b, c, d].map(tier)).toEqual(["active", "warm-next", "warm-after", "cold"])
        expect([a, b, c, d].map((el) => el.getAttribute("data-preload"))).toEqual([
            "auto",
            "auto",
            "metadata",
            "none",
        ])
    })

    it("nothing warms beyond the look-ahead", () => {
        const [a, b] = tiles("a", "b")
        elect(a)
        expect(tier(b)).toBe("cold")

        coming(b)
        settle()
        expect(tier(b)).toBe("warm-next")
    })

    it("at most three: the next two come before the one above", () => {
        const [a, b, c, d] = tiles("a", "b", "c", "d")
        coming(c)
        coming(d)
        see(a, 0.2)
        elect(b)

        expect([a, b, c, d].map(tier)).toEqual(["cold", "active", "warm-next", "warm-after"])
    })

    it("the one above is warm when the budget has room", () => {
        const [a, b] = tiles("a", "b")
        see(a, 0.2)
        elect(b)

        expect(tier(a)).toBe("warm-previous")
        expect(a.getAttribute("data-preload")).toBe("metadata")
    })

    it("holding data over budget gives it back", () => {
        const [a, b, c, d] = tiles("a", "b", "c", "d")
        coming(c)
        coming(d)
        Object.defineProperty(a, "readyState", { configurable: true, value: 4 })
        see(a, 0.2)
        elect(b)

        expect(tier(a)).toBe("released")
    })

    it("more than three screens away gives the source back", () => {
        const [a, b] = tiles("a", "b")
        placeAt(b, window.innerHeight * 5)
        elect(a)

        expect(tier(b)).toBe("released")
    })

    it("with no winner, next counts from the first video on or below the screen", () => {
        const [a, b, c] = tiles("a", "b", "c")
        placeAt(a, -2000)
        placeAt(b, 900)
        placeAt(c, 1400)
        coming(b)
        coming(c)
        settle()

        expect([b, c].map(tier)).toEqual(["warm-next", "warm-after"])
    })

    it("data saver: no video warms", () => {
        const undo = stubConnection({ saveData: true })
        const [a, b, c] = tiles("a", "b", "c")
        coming(b)
        coming(c)
        elect(a)

        expect([a, b, c].map(tier)).toEqual(["active", "cold", "cold"])
        undo()
    })

    it("2g counts as data saver", () => {
        const undo = stubConnection({ effectiveType: "2g" })
        expect(prefersReducedData()).toBe(true)
        undo()
        expect(prefersReducedData()).toBe(false)
    })

    it("a fling does not re-tier what it flies past", () => {
        const [a, b, c] = tiles("a", "b", "c")
        coming(b)
        coming(c)
        settle()
        const before = tier(c)

        see(a, 1)
        act(() => {
            vi.advanceTimersByTime(50)
        })

        expect(tier(c)).toBe(before)
    })

    it("unmounting gives the source back", () => {
        const [a] = tiles("a")
        a.setAttribute("src", "x.mp4")

        cleanup()

        expect(a.hasAttribute("src")).toBe(false)
        expect(media.load).toHaveBeenCalled()
    })
})

describe("helpers", () => {
    it("preloadForTier: a cold video with no poster fetches its frame when close", () => {
        const cold = (hasPoster: boolean, near: boolean, saveData = false) =>
            preloadForTier("cold", { hasPoster, near, saveData })

        expect(cold(true, true)).toBe("none")
        expect(cold(false, true)).toBe("metadata")
        expect(cold(false, false)).toBe("none")
        expect(cold(false, true, true)).toBe("none")
    })

    it("firstFrameSrc asks for a frame only with no poster", () => {
        expect(firstFrameSrc("a.mp4", true)).toBe("a.mp4")
        expect(firstFrameSrc("a.mp4", false)).toBe("a.mp4#t=0.1")
        expect(firstFrameSrc("", false)).toBe("")
    })

    it("releaseVideoElement stops it and frees the source", () => {
        const video = document.createElement("video")
        video.setAttribute("src", "a.mp4")

        releaseVideoElement(video)

        expect(media.pause).toHaveBeenCalled()
        expect(video.hasAttribute("src")).toBe(false)
        expect(media.load).toHaveBeenCalled()
    })

    it("lookAheadTarget finds the box with layout under content-visibility", () => {
        const card = document.createElement("div")
        const inner = card.appendChild(document.createElement("div"))
        const video = inner.appendChild(document.createElement("video"))
        document.body.appendChild(card)
        vi.spyOn(window, "getComputedStyle").mockImplementation(
            (el) => ({ contentVisibility: el === card ? "auto" : "visible" }) as CSSStyleDeclaration
        )

        expect(lookAheadTarget(video)).toBe(card)
    })

    it("lookAheadTarget is the element itself otherwise", () => {
        const video = document.body.appendChild(document.createElement("video"))
        expect(lookAheadTarget(video)).toBe(video)
    })

    describe("whenFirstFrame", () => {
        const playingVideo = (time: number) => {
            const video = document.createElement("video")
            Object.defineProperty(video, "currentTime", { configurable: true, value: time })
            return video
        }

        it("falls back to playing + a moving clock", () => {
            const video = playingVideo(0)
            const done = vi.fn()
            whenFirstFrame(video, done)
            media.isPlaying(video)
            void video.play()

            video.dispatchEvent(new Event("playing"))
            expect(done).not.toHaveBeenCalled()

            Object.defineProperty(video, "currentTime", { configurable: true, value: 0.2 })
            video.dispatchEvent(new Event("timeupdate"))
            expect(done).toHaveBeenCalledTimes(1)
        })

        it("uses requestVideoFrameCallback, and a paused frame does not count", () => {
            const video = playingVideo(0)
            const callbacks: Array<() => void> = []
            Object.assign(video, {
                requestVideoFrameCallback: (cb: () => void) => callbacks.push(cb),
                cancelVideoFrameCallback: vi.fn(),
            })
            const done = vi.fn()
            whenFirstFrame(video, done)

            callbacks.shift()!()
            expect(done).not.toHaveBeenCalled()

            void video.play()
            callbacks.shift()!()
            expect(done).toHaveBeenCalledTimes(1)
        })

        it("can be cancelled", () => {
            const video = playingVideo(1)
            const done = vi.fn()
            const cancel = whenFirstFrame(video, done)
            void video.play()

            cancel()
            video.dispatchEvent(new Event("timeupdate"))

            expect(done).not.toHaveBeenCalled()
        })
    })
})
