/**
 * Test doubles for the playback tests: jsdom has no IntersectionObserver and no
 * media stack. Imported by tests only.
 */

import { act } from "@testing-library/react"
import { vi } from "vitest"

export class FakeObserver {
    static instances: FakeObserver[] = []
    targets = new Set<Element>()
    root = null
    rootMargin = ""
    thresholds: number[] = []

    constructor(
        public callback: IntersectionObserverCallback,
        public options: IntersectionObserverInit = {}
    ) {
        FakeObserver.instances.push(this)
    }
    observe(el: Element) {
        this.targets.add(el)
    }
    unobserve(el: Element) {
        this.targets.delete(el)
    }
    disconnect() {
        this.targets.clear()
    }
    takeRecords() {
        return []
    }
    fire(records: Partial<IntersectionObserverEntry>[]) {
        this.callback(records as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
    }
}

export const ratioObserver = () =>
    FakeObserver.instances.find((o) => Array.isArray(o.options.threshold) && o.options.threshold.includes(0))!
export const aheadObserver = () =>
    FakeObserver.instances.find((o) => o.options.rootMargin === "0px 0px 200% 0px")!

/** The election observer reports `el` this visible. */
export function see(el: Element, ratio: number) {
    act(() => ratioObserver().fire([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]))
}

/** The look-ahead observer reports `el` as coming up, or not. */
export function coming(el: Element, isIntersecting = true) {
    act(() => aheadObserver().fire([{ target: el, isIntersecting }]))
}

/** Past the frame the election waits for, and the debounces after it. */
export function settle() {
    act(() => {
        vi.advanceTimersByTime(20)
    })
    act(() => {
        vi.advanceTimersByTime(200)
    })
}

export function useFakePlaybackTimers() {
    vi.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    })
}

/**
 * play() and pause() that really change `paused` and fire their events, in the
 * order a browser would. `plays` lists every element play() was called on.
 */
export function installFakeMedia() {
    const playing = new WeakSet<HTMLMediaElement>()
    const plays: HTMLMediaElement[] = []

    vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (
        this: HTMLMediaElement
    ) {
        return !playing.has(this)
    })
    const play = vi
        .spyOn(HTMLMediaElement.prototype, "play")
        .mockImplementation(async function (this: HTMLMediaElement) {
            plays.push(this)
            if (playing.has(this)) return
            playing.add(this)
            this.dispatchEvent(new Event("play"))
        })
    const pause = vi
        .spyOn(HTMLMediaElement.prototype, "pause")
        .mockImplementation(function (this: HTMLMediaElement) {
            if (!playing.delete(this)) return
            this.dispatchEvent(new Event("pause"))
        })
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined)

    return {
        plays,
        play,
        pause,
        load,
        isPlaying: (el: HTMLMediaElement) => playing.has(el),
        /** Who is playing, of `els`. */
        playingOf: <T extends HTMLMediaElement>(els: T[]) => els.filter((el) => playing.has(el)),
    }
}

/** navigator.connection, for the data-saver cases. Returns the undo. */
export function stubConnection(value: { saveData?: boolean; effectiveType?: string }) {
    Object.defineProperty(navigator, "connection", { configurable: true, value })
    return () => {
        delete (navigator as unknown as { connection?: unknown }).connection
    }
}

/** `document.hidden`, with the event that goes with changing it. Returns the setter. */
export function stubDocumentHidden() {
    let hidden = false
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
    return (next: boolean) => {
        hidden = next
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"))
        })
    }
}

/** Put `el` at this position, for the centre tie-break and the far rule. */
export function placeAt(el: Element, top: number, height = 200) {
    el.getBoundingClientRect = () =>
        ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect
}
