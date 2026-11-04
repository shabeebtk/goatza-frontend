"use client"

/**
 * One player at a time. Everything that decides whether a <video> plays lives
 * here; see "Video playback" in CLAUDE.md.
 *
 *   The guard      any <video> that starts playing pauses every other one, on
 *                  any surface. The backstop that makes "never two" true even
 *                  for a player nobody remembered to wire up.
 *   The election   feed videos do not decide for themselves. They register, and
 *                  the most visible one (≥ 60%) plays. A fling cannot start
 *                  five: a new winner has to hold for 150 ms first.
 *   Suspension     a counted "nothing autoplays now" for whatever covers the
 *                  feed — a composer, a viewer, the upload screen. Lifting it
 *                  resumes only what it paused, never what the reader paused.
 *   Tiers          which feed videos hold a source. The winner and the next two
 *                  load; the rest wait, and far away they give it back, because
 *                  iOS blanks or kills a tab holding too many live videos.
 *
 * Module-level, like useBackToClose's overlay stack: the videos are mounted by
 * unrelated cards and the only thing they share is the screen.
 */

import { useEffect, useState, type RefObject } from "react"

import { useSoundStore } from "@/store/sound.store"

/** Put this on a media element to take it out of all of the above. */
export const PLAYBACK_EXEMPT_ATTR = "data-playback-exempt"

/** .6 is the winning line: without it the ratio would next be read at .75. */
const RATIO_THRESHOLDS = [0, 0.25, 0.5, 0.6, 0.75, 1]
const MIN_WINNER_RATIO = 0.6
/** Ratios this close are a tie; the one nearer the centre takes it. */
const TIE_EPSILON = 0.01
/** A new winner must hold this long, so a fast fling starts nothing. */
const START_DEBOUNCE_MS = 150
/** Two screens below the viewport. */
const LOOK_AHEAD_MARGIN = "0px 0px 200% 0px"
/** The winner plus two: the most feed videos that hold loaded data at once. */
const MAX_LOADED_SOURCES = 3
/** Further than this from the viewport, a video gives its source back. */
const RELEASE_SCREENS = 3

const NETWORK_LOADING = 2

export type PlaybackTier =
    /** The election winner. */
    | "active"
    /** The next video below it: preload="auto". */
    | "warm-next"
    /** The one after: preload="metadata". */
    | "warm-after"
    /** The one just above it, if the budget has room: preload="metadata". */
    | "warm-previous"
    /** preload="none": holds a source URL, has fetched nothing. */
    | "cold"
    /** No source at all. */
    | "released"

export type VideoPreload = "auto" | "metadata" | "none"

export type AutoplayState = {
    tier: PlaybackTier
    preload: VideoPreload
    /** False: useAdaptiveVideo gives the source back. */
    attached: boolean
    /** In the viewport or the look-ahead: time to show a thumbnail. */
    near: boolean
    /** The browser refused even muted playback (Low Power Mode, data saver). */
    blocked: boolean
}

type Entry = {
    el: HTMLVideoElement
    id: string
    enabled: boolean
    hasPoster: boolean
    /** The box the look-ahead watches; see lookAheadTarget. */
    target: Element
    ratio: number
    ahead: boolean
    tier: PlaybackTier
    blocked: boolean
    /** Paused by this module, so it may resume it. */
    pausedByUs: boolean
    /** Paused by anything else, so it may not, until it has left the screen. */
    userPaused: boolean
    userPausedAt: number
    notify: (state: AutoplayState) => void
    lastState: AutoplayState | null
    removeListeners: () => void
}

const entries = new Map<HTMLVideoElement, Entry>()
let winner: Entry | null = null
let pending: Entry | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let retierTimer: ReturnType<typeof setTimeout> | null = null
let electionFrame = 0
let suspensions = 0

let ratioObserver: IntersectionObserver | null = null
let aheadObserver: IntersectionObserver | null = null
/** One card can hold several videos, and they share its look-ahead target. */
const aheadTargets = new Map<Element, Set<Entry>>()

// ── Small helpers, used on their own by the viewers ───────────

/** Data saver, or a connection that cannot spare it: no video preloading. */
export function prefersReducedData(): boolean {
    if (typeof navigator === "undefined") return false
    const connection = (
        navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string }
        }
    ).connection
    if (!connection) return false
    return (
        connection.saveData === true ||
        connection.effectiveType === "2g" ||
        connection.effectiveType === "slow-2g"
    )
}

/**
 * A video with no thumbnail has nothing to show until it plays, so it asks for
 * a frame just past the start, which the browser paints instead of black.
 */
export function firstFrameSrc(src: string, hasPoster: boolean): string {
    return src && !hasPoster ? `${src}#t=0.1` : src
}

/**
 * Stop `video` and give its source back, which is what frees the decoder.
 * Unmounting alone does not do that promptly on iOS.
 */
export function releaseVideoElement(video: HTMLVideoElement): void {
    video.pause()
    if (!video.hasAttribute("src")) return
    video.removeAttribute("src")
    video.load()
}

/**
 * Calls back once a frame has really been painted while playing: the moment a
 * poster layer may go. `canplay` fires too early for that on iOS, which is the
 * black flash. Returns a cancel.
 */
export function whenFirstFrame(video: HTMLVideoElement, onFrame: () => void): () => void {
    let done = false
    let frameId: number | null = null

    const stop = () => {
        video.removeEventListener("playing", onProgress)
        video.removeEventListener("timeupdate", onProgress)
        if (frameId !== null) video.cancelVideoFrameCallback?.(frameId)
        frameId = null
    }
    const finish = () => {
        if (done) return
        done = true
        stop()
        onFrame()
    }
    function onProgress() {
        if (!video.paused && video.currentTime > 0) finish()
    }
    // A preloaded element can present its first frame while still paused; that
    // is not the clip starting, so wait for the next one.
    const onVideoFrame = () => {
        frameId = null
        if (!video.paused) finish()
        else frameId = video.requestVideoFrameCallback(onVideoFrame)
    }

    if (typeof video.requestVideoFrameCallback === "function") {
        frameId = video.requestVideoFrameCallback(onVideoFrame)
    }
    // Also where the callback exists: it does not fire for an element the
    // browser has decided not to render, and a poster must not get stuck.
    video.addEventListener("playing", onProgress)
    video.addEventListener("timeupdate", onProgress)

    return () => {
        done = true
        stop()
    }
}

/**
 * The box to watch for "is this coming up?".
 *
 * Every post list sets `content-visibility: auto` on its items, and an observer
 * cannot see inside a skipped subtree: it would only report the video once the
 * browser had already decided to render the card, which is later than any look
 * ahead wants. So it watches the outermost thing that still has layout.
 */
export function lookAheadTarget(el: Element): Element {
    if (typeof getComputedStyle !== "function") return el
    let node = el.parentElement
    for (let depth = 0; node && depth < 12; depth++) {
        if (getComputedStyle(node).contentVisibility === "auto") return node
        node = node.parentElement
    }
    return el
}

export function preloadForTier(
    tier: PlaybackTier,
    { hasPoster, near, saveData }: { hasPoster: boolean; near: boolean; saveData: boolean }
): VideoPreload {
    switch (tier) {
        case "active":
        case "warm-next":
            return "auto"
        case "warm-after":
        case "warm-previous":
            return "metadata"
        case "cold":
            // Its thumbnail is the frame it paints, so it fetches one when
            // close. Outside the budget on purpose: a metadata fetch for a
            // pre-thumbnail row, not a decoder held open.
            return !hasPoster && near && !saveData ? "metadata" : "none"
        case "released":
            return "none"
    }
}

// ── 1. The guard ──────────────────────────────────────────────

function onAnyPlay(event: Event) {
    const started = event.target
    if (!(started instanceof HTMLMediaElement)) return
    if (started.hasAttribute(PLAYBACK_EXEMPT_ATTR)) return

    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((other) => {
        if (other === started || other.paused) return
        if (other.hasAttribute(PLAYBACK_EXEMPT_ATTR)) return
        // A feed video losing to something the reader started: it does not come
        // back on the next scroll tick and pause THAT.
        const entry = entries.get(other as HTMLVideoElement)
        if (entry) {
            entry.pausedByUs = true
            entry.userPaused = true
            entry.userPausedAt = performance.now()
        }
        other.pause()
    })
}

let guardInstalled = false

/** Idempotent; does nothing on the server. */
export function installPlaybackGuard(): void {
    if (guardInstalled || typeof document === "undefined") return
    guardInstalled = true
    // Capture: `play` does not bubble.
    document.addEventListener("play", onAnyPlay, true)
}

// ── 2. The election ───────────────────────────────────────────

const isHeld = () => suspensions > 0 || (typeof document !== "undefined" && document.hidden)

const isEligible = (entry: Entry) => entry.enabled && entry.ratio >= MIN_WINNER_RATIO

const distanceFromCentre = (el: Element) => {
    const rect = el.getBoundingClientRect()
    return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
}

/** The highest ratio ≥ 60%; a tie goes to the one nearest the viewport's centre. */
function pickWinner(): Entry | null {
    let best: Entry | null = null
    for (const entry of entries.values()) {
        if (!isEligible(entry)) continue
        if (!best || entry.ratio > best.ratio + TIE_EPSILON) {
            best = entry
        } else if (
            Math.abs(entry.ratio - best.ratio) <= TIE_EPSILON &&
            distanceFromCentre(entry.el) < distanceFromCentre(best.el)
        ) {
            best = entry
        }
    }
    return best
}

function pauseByUs(entry: Entry) {
    entry.pausedByUs = true
    entry.el.pause()
}

function setBlocked(entry: Entry, blocked: boolean) {
    if (entry.blocked === blocked) return
    entry.blocked = blocked
    publish(entry)
}

const isAbort = (err: unknown) => (err as { name?: string } | null)?.name === "AbortError"

function startPlaying(entry: Entry) {
    const { el } = entry
    entry.pausedByUs = false

    // Before ANY play(): the autoplay policy reads the property.
    const { muted, forceMute } = useSoundStore.getState()
    el.muted = muted
    el.defaultMuted = muted

    // A released element has no source yet. useAdaptiveVideo attaches one on
    // the next commit, which aborts this; its `loadstart` asks again.
    if (el.readyState === 0 && el.networkState !== NETWORK_LOADING && el.hasAttribute("src")) {
        el.load()
    }

    // Promise.resolve: older WebKit's play() does not return a promise.
    Promise.resolve(el.play())
        .then(() => setBlocked(entry, false))
        .catch((err: unknown) => {
            // Interrupted by a pause or a new source, not refused.
            if (isAbort(err)) return
            if (el.muted) {
                setBlocked(entry, true)
                return
            }
            // Scrolled into view with sound on, and the browser refused.
            // Autoplay always beats sound: drop to muted, retry once, and move
            // EVERY icon in the app so none of them are lying about the state.
            el.muted = true
            el.defaultMuted = true
            forceMute()
            Promise.resolve(el.play())
                .then(() => setBlocked(entry, false))
                .catch((retryErr: unknown) => {
                    if (!isAbort(retryErr)) setBlocked(entry, true)
                })
        })
}

/** Play it, unless the reader stopped it or it is already going. */
function resume(entry: Entry) {
    if (entry.userPaused || !entry.el.paused) return
    startPlaying(entry)
}

function clearPending() {
    if (pendingTimer !== null) clearTimeout(pendingTimer)
    pendingTimer = null
    pending = null
}

function promotePending() {
    const candidate = pending
    pendingTimer = null
    pending = null
    if (!candidate) return
    if (isHeld() || pickWinner() !== candidate) {
        scheduleSettle()
        return
    }
    if (winner && winner !== candidate) pauseByUs(winner)
    winner = candidate
    resume(candidate)
    retierNow()
}

function settle() {
    electionFrame = 0

    if (isHeld()) {
        clearPending()
        for (const entry of entries.values()) {
            if (!entry.el.paused) pauseByUs(entry)
        }
        scheduleRetier()
        return
    }

    const next = pickWinner()

    // Off the screen: stops now. Merely beaten: keeps playing until the new
    // winner has held, so a tile never sits frozen for the debounce.
    if (winner && !isEligible(winner)) {
        pauseByUs(winner)
        winner = null
    }

    if (next === winner) {
        clearPending()
        if (winner) resume(winner)
        scheduleRetier()
        return
    }

    if (!next) {
        clearPending()
        scheduleRetier()
        return
    }

    if (pending !== next) {
        clearPending()
        pending = next
        pendingTimer = setTimeout(promotePending, START_DEBOUNCE_MS)
    }
}

/** Coalesced: many observer entries in one frame are one election. */
function scheduleSettle() {
    if (electionFrame || typeof requestAnimationFrame === "undefined") return
    electionFrame = requestAnimationFrame(settle)
}

/** Now, not on the next frame: a covered feed has to stop as it is covered. */
function settleNow() {
    if (electionFrame) cancelAnimationFrame(electionFrame)
    settle()
}

// ── 3. Suspension ─────────────────────────────────────────────

/** Nothing autoplays until the returned function is called. Counted. */
export function suspendPlayback(): () => void {
    suspensions++
    if (suspensions === 1) settleNow()

    let released = false
    return () => {
        if (released) return
        released = true
        suspensions = Math.max(0, suspensions - 1)
        // On a frame, so an overlay closing in the tick another opens (the
        // composer → the upload screen) never lets a video through between.
        if (suspensions === 0) scheduleSettle()
    }
}

/** For whatever covers the feed. `active: false` lifts it without unmounting. */
export function useSuspendPlayback(active = true): void {
    useEffect(() => {
        if (!active) return
        return suspendPlayback()
    }, [active])
}

function onVisibilityChange() {
    if (document.hidden) {
        // The OS pauses media as an app goes to the background, and that can
        // arrive just before this. It was not the reader.
        const now = performance.now()
        for (const entry of entries.values()) {
            if (entry.userPaused && now - entry.userPausedAt < 1000) entry.userPaused = false
        }
        settleNow()
        return
    }
    scheduleSettle()
}

// ── 4. Tiers ──────────────────────────────────────────────────

function sortedByDocument(): Entry[] {
    return [...entries.values()].sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
}

function isFar(entry: Entry): boolean {
    const rect = entry.target.getBoundingClientRect()
    const screen = window.innerHeight
    return rect.bottom < -RELEASE_SCREENS * screen || rect.top > screen + RELEASE_SCREENS * screen
}

function retierNow() {
    if (retierTimer !== null) clearTimeout(retierTimer)
    retierTimer = null

    const ordered = sortedByDocument()
    const focus = winner
    const saveData = prefersReducedData()

    // Where "next" starts from: the winner, or with none (between videos, a
    // long text post) the first video still on or below the screen.
    const focusIndex = focus ? ordered.indexOf(focus) : -1
    const firstBelow = focus
        ? focusIndex + 1
        : Math.max(
              0,
              ordered.findIndex((entry) => entry.target.getBoundingClientRect().bottom > 0)
          )

    const tiers = new Map<Entry, PlaybackTier>()
    if (focus) tiers.set(focus, "active")

    // Spending the budget in order of how soon each will be wanted: the next
    // two are the promise, and the one above only gets what is left over.
    let budget = MAX_LOADED_SOURCES - (focus ? 1 : 0)
    if (!saveData) {
        const next = ordered[firstBelow]
        const after = ordered[firstBelow + 1]
        const previous = ordered[firstBelow - (focus ? 2 : 1)]
        if (next?.ahead && next.enabled && budget > 0) {
            tiers.set(next, "warm-next")
            budget--
        }
        if (after?.ahead && after.enabled && budget > 0) {
            tiers.set(after, "warm-after")
            budget--
        }
        if (previous && previous.enabled && budget > 0 && !isFar(previous)) {
            tiers.set(previous, "warm-previous")
            budget--
        }
    }

    for (const entry of ordered) {
        let tier = tiers.get(entry)
        if (!tier) {
            // Over budget with data in hand gives it back as well: preload="none"
            // only stops new fetches, it does not free what is already held.
            const overBudget = entry.hasPoster && entry.el.readyState > 0
            tier = overBudget || isFar(entry) ? "released" : "cold"
        }
        entry.tier = tier
        publish(entry)
    }
}

function scheduleRetier() {
    if (retierTimer !== null) clearTimeout(retierTimer)
    // The same wait as the election: a fling does not load what it flies past.
    retierTimer = setTimeout(retierNow, START_DEBOUNCE_MS)
}

function stateOf(entry: Entry): AutoplayState {
    const near = entry.ahead || entry.ratio > 0
    return {
        tier: entry.tier,
        preload: preloadForTier(entry.tier, {
            hasPoster: entry.hasPoster,
            near,
            saveData: prefersReducedData(),
        }),
        attached: entry.tier !== "released",
        near,
        blocked: entry.blocked,
    }
}

function publish(entry: Entry) {
    const next = stateOf(entry)
    const last = entry.lastState
    if (
        last &&
        last.tier === next.tier &&
        last.preload === next.preload &&
        last.near === next.near &&
        last.blocked === next.blocked
    ) {
        return
    }
    entry.lastState = next
    entry.notify(next)
}

// ── Observers ─────────────────────────────────────────────────

/**
 * How much of the video is on screen. A clip taller than the viewport (a 4:5
 * tile on a phone held sideways) can never reach 60% of itself, so filling most
 * of the screen counts too.
 */
function visibleRatio(record: IntersectionObserverEntry): number {
    if (!record.isIntersecting) return 0
    const rootHeight = record.rootBounds?.height ?? 0
    const fill = rootHeight > 0 ? (record.intersectionRect?.height ?? 0) / rootHeight : 0
    return Math.max(record.intersectionRatio, fill)
}

function onRatioRecords(records: IntersectionObserverEntry[]) {
    for (const record of records) {
        const entry = entries.get(record.target as HTMLVideoElement)
        if (!entry) continue
        entry.ratio = visibleRatio(record)
        // Off the screen and back is a fresh start, whoever paused it.
        if (entry.ratio < MIN_WINNER_RATIO) entry.userPaused = false
        publish(entry)
    }
    scheduleSettle()
}

function onAheadRecords(records: IntersectionObserverEntry[]) {
    for (const record of records) {
        for (const entry of aheadTargets.get(record.target) ?? []) {
            entry.ahead = record.isIntersecting
            publish(entry)
        }
    }
    scheduleSettle()
}

function observe(entry: Entry) {
    if (typeof IntersectionObserver === "undefined") return
    ratioObserver ??= new IntersectionObserver(onRatioRecords, { threshold: RATIO_THRESHOLDS })
    aheadObserver ??= new IntersectionObserver(onAheadRecords, { rootMargin: LOOK_AHEAD_MARGIN })

    ratioObserver.observe(entry.el)
    const sharing = aheadTargets.get(entry.target)
    if (sharing) {
        sharing.add(entry)
        // Its target already reported, and will not report again for it.
        entry.ahead = [...sharing].some((other) => other !== entry && other.ahead)
    } else {
        aheadTargets.set(entry.target, new Set([entry]))
        aheadObserver.observe(entry.target)
    }
}

function unobserve(entry: Entry) {
    ratioObserver?.unobserve(entry.el)
    const sharing = aheadTargets.get(entry.target)
    sharing?.delete(entry)
    if (sharing?.size === 0) {
        aheadTargets.delete(entry.target)
        aheadObserver?.unobserve(entry.target)
    }
}

// ── Registration ──────────────────────────────────────────────

let visibilityListening = false

function register(
    el: HTMLVideoElement,
    options: { id: string; enabled: boolean; hasPoster: boolean; notify: (state: AutoplayState) => void }
): () => void {
    installPlaybackGuard()
    if (!visibilityListening) {
        visibilityListening = true
        document.addEventListener("visibilitychange", onVisibilityChange)
    }

    const entry: Entry = {
        el,
        id: options.id,
        enabled: options.enabled,
        hasPoster: options.hasPoster,
        target: lookAheadTarget(el),
        ratio: 0,
        ahead: false,
        tier: "cold",
        blocked: false,
        pausedByUs: false,
        userPaused: false,
        userPausedAt: 0,
        notify: options.notify,
        lastState: null,
        removeListeners: () => {},
    }

    const onPause = () => {
        if (entry.pausedByUs || winner !== entry) return
        // The tab going away and a clip ending are not somebody's decision.
        if (document.hidden || el.ended || !el.isConnected) return
        entry.userPaused = true
        entry.userPausedAt = performance.now()
    }
    // A new source has just gone on (see startPlaying). If this is still the
    // winner, it was already meant to be playing.
    const onLoadStart = () => {
        if (winner === entry && !isHeld()) resume(entry)
    }
    el.addEventListener("pause", onPause)
    el.addEventListener("loadstart", onLoadStart)
    entry.removeListeners = () => {
        el.removeEventListener("pause", onPause)
        el.removeEventListener("loadstart", onLoadStart)
    }

    entries.set(el, entry)
    observe(entry)
    publish(entry)

    return () => {
        entry.removeListeners()
        unobserve(entry)
        entries.delete(el)
        if (winner === entry) winner = null
        if (pending === entry) clearPending()
        scheduleSettle()
    }
}

function setEnabled(el: HTMLVideoElement, enabled: boolean) {
    const entry = entries.get(el)
    if (!entry || entry.enabled === enabled) return
    entry.enabled = enabled
    scheduleSettle()
}

const INITIAL_STATE: AutoplayState = {
    tier: "cold",
    preload: "none",
    attached: true,
    near: false,
    blocked: false,
}

/**
 * Hand a feed video to the election. The caller renders what comes back: the
 * `preload`, whether the source stays attached, whether to show a thumbnail. It
 * never calls play() or pause() itself.
 */
export function useAutoplayVideo(
    videoRef: RefObject<HTMLVideoElement | null>,
    { id, enabled = true, hasPoster = true }: { id: string; enabled?: boolean; hasPoster?: boolean }
): AutoplayState {
    const [state, setState] = useState<AutoplayState>(INITIAL_STATE)

    useEffect(() => {
        const el = videoRef.current
        if (!el) return
        const unregister = register(el, { id, enabled: true, hasPoster, notify: setState })
        return () => {
            unregister()
            releaseVideoElement(el)
        }
        // `enabled` has its own effect: toggling it must not lose the source.
    }, [videoRef, id, hasPoster])

    useEffect(() => {
        const el = videoRef.current
        if (el) setEnabled(el, enabled)
    }, [videoRef, enabled])

    return state
}

/** The id of the video the election has playing. */
export const currentWinnerId = (): string | null => winner?.id ?? null

/** Module state outlives a test file's cleanup; this puts it back. */
export function resetPlaybackForTests(): void {
    clearPending()
    if (retierTimer !== null) clearTimeout(retierTimer)
    retierTimer = null
    if (electionFrame) cancelAnimationFrame(electionFrame)
    electionFrame = 0
    for (const entry of entries.values()) entry.removeListeners()
    entries.clear()
    aheadTargets.clear()
    winner = null
    suspensions = 0
    ratioObserver?.disconnect()
    aheadObserver?.disconnect()
    ratioObserver = null
    aheadObserver = null
    if (typeof document !== "undefined") {
        if (guardInstalled) document.removeEventListener("play", onAnyPlay, true)
        if (visibilityListening) document.removeEventListener("visibilitychange", onVisibilityChange)
    }
    guardInstalled = false
    visibilityListening = false
}
