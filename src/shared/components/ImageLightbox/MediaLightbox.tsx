"use client"

/**
 * MediaLightbox — media only, full screen, plus a way out.
 *
 * The one full-screen viewer for media that is not a post: a chat photo or
 * clip, a recruitment's ordered gallery. It is built to feel like the post
 * viewer's phone layout — black full-bleed stage, `.phoneTop`-style bar with
 * close / counter / mute, pinch and double-tap zoom, tap-to-play video with a
 * centre flash and a progress hairline — with everything social left out:
 * no likes, comments, captions or share. That is the whole design. Anything
 * that needs those is a post and opens PostViewer.
 *
 * ImageLightbox is its older sibling and stays for achievements; this one has
 * the gestures and the history entry, so chat and recruitments moved here.
 *
 * Mount it conditionally (`{open && <MediaLightbox … />}`) rather than passing
 * an `open` prop: the scroll lock, the history entry, the focus capture and
 * the focus return all hang off mount/unmount, which is what makes them
 * impossible to leak.
 *
 * Ways out: the ✕, Esc, the phone's back gesture. NOT a tap on the media —
 * the post viewer does not close on one either, and on a photo viewer a tap
 * is a zoom or a play/pause, never a dismissal.
 */

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
    type TouchEvent as ReactTouchEvent,
} from "react"
import { Icon } from "@iconify/react"

import Portal from "../ui/Portal/Portal"
import styles from "./MediaLightbox.module.css"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { returnFocus } from "@/shared/services/focusReturn"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useHtmlFlag } from "@/shared/hooks/useHtmlFlag"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import { useZoomPan } from "@/shared/hooks/useZoomPan"
import { posterSrc, thumbSrc, videoSrc } from "@/shared/services/mediaDelivery"
import { useSoundStore } from "@/store/sound.store"

/**
 * Structurally what `RecruitmentMedia` already is, declared here so this shared
 * component does not import a feature's types. Anything with a URL and a kind
 * can open in it — a chat message maps `media_url` onto `file_url`.
 */
export interface MediaLightboxItem {
    id?: string
    media_type: "image" | "video"
    file_url: string
    /** The 640px copy / poster frame: shown first, swapped for the full file. */
    thumbnail_url?: string | null
    duration?: number | null
}

interface MediaLightboxProps {
    /** Full-resolution sources, already in display order. */
    media: MediaLightboxItem[]
    /** Which item the tap opened — the viewer starts here, not at zero. */
    startIndex?: number
    onClose: () => void
    /** Dialog label. Defaults to the generic one. */
    label?: string
}

/** A drag shorter than this is a tap, not a swipe. Matches MediaCarousel. */
const SWIPE_THRESHOLD_PX = 40

/** A swipe that wanders further up/down than sideways is a scroll attempt. */
const SWIPE_AXIS_RATIO = 1.2

/** The tap-feedback icon stays this long. Same as ViewerVideo. */
const FLASH_MS = 600

/** Desktop control bar fades this long after the last interaction. */
const CONTROLS_HIDE_MS = 2500

// ── Images: thumbnail first, full file once it has loaded ─────

/**
 * The small copy paints at once — the bubble or the stage behind already has
 * it cached — and the full object replaces it when the browser has it. A
 * row without a thumbnail just shows the full file from the start.
 */
function useProgressiveSrc(item: MediaLightboxItem): string {
    const [src, setSrc] = useState(() => thumbSrc(item))

    // The slide is keyed by item, so this runs once per photo.
    useEffect(() => {
        const full = item.file_url
        if (!full || full === thumbSrc(item)) return
        let cancelled = false
        const img = new Image()
        img.onload = () => { if (!cancelled) setSrc(full) }
        img.src = full
        return () => { cancelled = true }
    }, [item])

    return src
}

// ── Video ─────────────────────────────────────────────────────

/** What the top bar's mute button and the keyboard drive. */
type LightboxVideoApi = {
    togglePlay: () => void
    toggleMute: () => void
}

/**
 * `play()` returns a promise in every browser the app targets; jsdom's stub
 * returns nothing, so the rejection handler is attached only when there is
 * one. The rejection itself is expected — the policy refusing unmuted sound.
 */
function safePlay(el: HTMLVideoElement, onRefused?: () => void) {
    const result = el.play() as Promise<void> | undefined
    if (result && typeof result.catch === "function") {
        result.catch(() => onRefused?.())
    }
}

function fmtClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
    const whole = Math.floor(seconds)
    const m = Math.floor(whole / 60)
    const s = whole % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * The light player: tap = play/pause with a centre flash, a progress hairline
 * on the phone and a small seek bar on desktop. Chrome-wise a sibling of
 * ViewerVideo's "minimal" mode, kept separate so the post viewer's player can
 * change without dragging chat and recruitments with it.
 *
 * Sound is GLOBAL: the element is bound to `sound.store` through
 * useVideoSound and keeps a BARE `muted` attribute (never `muted={…}`); the
 * hook writes the property after mount. A refused unmuted autoplay drops the
 * whole app to muted and retries, rather than opening on a frozen frame.
 */
function LightboxVideo({
    item,
    apiRef,
}: {
    item: MediaLightboxItem
    apiRef: RefObject<LightboxVideoApi | null>
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const { applyMuted, toggleMuted, reportBlocked } = useVideoSound(videoRef)

    const [paused, setPaused] = useState(false)
    const [flash, setFlash] = useState<"play" | "pause" | null>(null)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)

    const pausedRef = useRef(false)
    const autoPlayedRef = useRef(false)
    const flashTimerRef = useRef<number | null>(null)
    const hideTimerRef = useRef<number | null>(null)

    useEffect(() => () => {
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }, [])

    // Closing the viewer or changing slide unmounts this — stop the audio
    // rather than trusting the browser to pause a detached element.
    useEffect(() => {
        const el = videoRef.current
        return () => { el?.pause() }
    }, [])

    const showControls = useCallback(() => {
        setControlsVisible(true)
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = window.setTimeout(() => {
            // Paused → nothing is moving, so leave them up.
            if (!pausedRef.current) setControlsVisible(false)
        }, CONTROLS_HIDE_MS)
    }, [])

    const showFlash = useCallback((kind: "play" | "pause") => {
        setFlash(kind)
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
        flashTimerRef.current = window.setTimeout(() => setFlash(null), FLASH_MS)
    }, [])

    const togglePlay = useCallback(() => {
        const el = videoRef.current
        if (!el) return
        if (el.paused) {
            safePlay(el)
            showFlash("play")
        } else {
            el.pause()
            showFlash("pause")
        }
        showControls()
    }, [showControls, showFlash])

    const toggleMute = useCallback(() => {
        const el = videoRef.current
        if (!el) return
        // Applied to the element in the same tick as the store write — the
        // click is the gesture the autoplay policy is waiting for.
        applyMuted(!el.muted)
        toggleMuted()
        showControls()
    }, [applyMuted, showControls, toggleMuted])

    useEffect(() => {
        apiRef.current = { togglePlay, toggleMute }
        return () => { apiRef.current = null }
    }, [apiRef, togglePlay, toggleMute])

    // One-shot: try with the global sound state, and if the browser refuses
    // take muted playback — and move EVERY icon in the app with it.
    const onCanPlay = useCallback(() => {
        const el = videoRef.current
        if (!el || autoPlayedRef.current) return
        autoPlayedRef.current = true
        safePlay(el, () => {
            applyMuted(true)
            reportBlocked()
            safePlay(el)
        })
    }, [applyMuted, reportBlocked])

    const seekMax = duration || 0
    const progress = seekMax > 0 ? Math.min(1, currentTime / seekMax) : 0

    return (
        <div
            className={styles.videoFrame}
            onMouseMove={showControls}
            onTouchStart={showControls}
        >
            <video
                ref={videoRef}
                src={videoSrc(item)}
                poster={posterSrc(item) || undefined}
                className={styles.video}
                autoPlay
                // BARE `muted`, never muted={muted}: the server-rendered markup
                // and first client paint must always be muted, and
                // useVideoSound sets the property after mount.
                muted
                playsInline
                onCanPlay={onCanPlay}
                onPlay={() => { pausedRef.current = false; setPaused(false); showControls() }}
                onPause={() => { pausedRef.current = true; setPaused(true); setControlsVisible(true) }}
                onEnded={() => { pausedRef.current = true; setPaused(true); setControlsVisible(true) }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) =>
                    setDuration(
                        Number.isFinite(e.currentTarget.duration)
                            ? e.currentTarget.duration
                            : 0
                    )
                }
            />

            {flash && (
                <span className={styles.flash} aria-hidden="true">
                    <Icon icon={flash === "play" ? "mdi:play" : "mdi:pause"} width={40} height={40} />
                </span>
            )}

            {/* Phone: a hairline of progress along the bottom edge. */}
            <div className={styles.progress} aria-hidden="true">
                <span
                    className={styles.progressFill}
                    style={{ transform: `scaleX(${progress})` }}
                />
            </div>

            {/* Desktop: play/pause, clock, seek. Mute lives in the top bar. */}
            <div
                className={`${styles.controls} ${controlsVisible ? "" : styles.controlsHidden}`}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className={styles.ctrlBtn}
                    onClick={togglePlay}
                    aria-label={paused ? "Play video" : "Pause video"}
                >
                    <Icon icon={paused ? "mdi:play" : "mdi:pause"} width={20} height={20} />
                </button>
                <span className={styles.time}>
                    {fmtClock(currentTime)} / {fmtClock(duration)}
                </span>
                <input
                    type="range"
                    className={styles.seek}
                    min={0}
                    max={seekMax}
                    step="any"
                    value={Math.min(currentTime, seekMax)}
                    onChange={(e) => {
                        const next = Number(e.target.value)
                        setCurrentTime(next)
                        const el = videoRef.current
                        if (el) el.currentTime = next
                        showControls()
                    }}
                    aria-label="Seek"
                />
            </div>
        </div>
    )
}

// ── The viewer ────────────────────────────────────────────────

export default function MediaLightbox({
    media,
    startIndex = 0,
    onClose,
    label = "Media viewer",
}: MediaLightboxProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const videoApiRef = useRef<LightboxVideoApi | null>(null)
    const [idx, setIdx] = useState(() =>
        Math.max(0, Math.min(startIndex, media.length - 1))
    )

    const total = media.length
    const current = media[idx]
    const multi = total > 1
    const isVideo = current?.media_type === "video"

    const muted = useSoundStore((s) => s.muted)
    const toggleMuted = useSoundStore((s) => s.toggleMuted)

    // Pinch / double-tap / wheel zoom on images. A video slide disables it —
    // its tap is play/pause. No snap-back: a zoomed photo stays zoomed until
    // the reader double-taps out or changes slide.
    const zoom = useZoomPan({ enabled: !isVideo })
    const { resetZoom, isZoomed } = zoom

    const go = useCallback(
        (next: number) => {
            const clamped = Math.max(0, Math.min(next, total - 1))
            if (clamped === idx) return
            // The zoom belongs to the slide it was made on.
            resetZoom()
            setIdx(clamped)
        },
        [idx, total, resetZoom]
    )

    // ── Overlay plumbing ─────────────────────────────────────────
    // The lock is counted: this can open from inside a modal that locked the
    // page first, and the page stays covered until both are gone.
    useBodyScrollLock()
    // Covers the mobile bars: the toasts stop offsetting themselves by them.
    useHtmlFlag("chrome-covered")
    // ONE history entry on the SAME URL, so the phone's back gesture closes
    // the viewer rather than leaving the chat or the recruitment; the ✕ and
    // Esc go through the same entry so every way out agrees.
    const { requestClose } = useBackToClose(onClose)

    // ── Focus in, and back out without a ring for pointer users ──
    // A close by Esc returns focus to the opener WITH its ring, the way a
    // keyboard user expects; a close by tap, click or the back gesture
    // returns it quietly — see shared/services/focusReturn.ts.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        // Move focus in so Esc and the arrow keys work without a click first.
        dialogRef.current?.focus({ preventScroll: true })
        return () => returnFocus(previouslyFocused)
    }, [])

    // ── Keyboard ─────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                requestClose()
                return
            }
            // A focused control keeps its own keys: arrows on the seek bar
            // scrub, space on a button presses it. Doubling those up as slide
            // changes and play toggles is how one keypress does two things.
            const tag = (e.target as HTMLElement | null)?.tagName
            if (tag === "INPUT" || tag === "BUTTON" || tag === "VIDEO") return
            switch (e.key) {
                case "ArrowRight":
                    if (multi) go(idx + 1)
                    return
                case "ArrowLeft":
                    if (multi) go(idx - 1)
                    return
                case " ":
                case "k":
                    if (videoApiRef.current) {
                        e.preventDefault()
                        videoApiRef.current.togglePlay()
                    }
                    return
                case "m":
                    if (videoApiRef.current) videoApiRef.current.toggleMute()
                    return
                default:
                    return
            }
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [requestClose, multi, idx, go])

    // ── Swipe between items ──────────────────────────────────────
    // Recorded on the stage, decided on release: a one-finger horizontal
    // drag past the threshold changes slide. A pinch (two fingers) and a pan
    // on a zoomed photo belong to useZoomPan and never read as a swipe.
    const swipe = useRef<{ x: number; y: number; fingers: number } | null>(null)

    const onTouchStart = (e: ReactTouchEvent) => {
        swipe.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            fingers: e.touches.length,
        }
    }
    const onTouchEnd = (e: ReactTouchEvent) => {
        const start = swipe.current
        swipe.current = null
        if (!start || start.fingers !== 1 || !multi || isZoomed) return
        if (e.touches.length > 0) return
        const dx = start.x - e.changedTouches[0].clientX
        const dy = start.y - e.changedTouches[0].clientY
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
        if (Math.abs(dy) > Math.abs(dx) * SWIPE_AXIS_RATIO) return
        go(idx + (dx > 0 ? 1 : -1))
    }

    const onMuteClick = () => {
        const api = videoApiRef.current
        if (api) api.toggleMute()
        else toggleMuted()
    }

    if (!current) return null

    return (
        <Portal>
            <div
                ref={dialogRef}
                className={styles.viewer}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
            >
                {/* ── Stage: the media, the gestures ── */}
                <div
                    className={styles.stage}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={() => { swipe.current = null }}
                >
                    {isVideo ? (
                        /* key: changing slide gets a FRESH element, so the
                           outgoing one unmounts — which is what pauses it. */
                        <div
                            className={`${styles.slide} ${styles.slideVideo}`}
                            onClick={() => videoApiRef.current?.togglePlay()}
                        >
                            <LightboxVideo
                                key={current.id ?? current.file_url}
                                item={current}
                                apiRef={videoApiRef}
                            />
                        </div>
                    ) : (
                        <ImageSlide
                            key={current.id ?? current.file_url}
                            item={current}
                            zoom={zoom}
                        />
                    )}
                </div>

                {/* ── Top bar: close · counter · mute ── */}
                <div className={styles.top}>
                    <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={requestClose}
                        aria-label="Close"
                    >
                        <Icon icon="mdi:close" width={24} height={24} />
                    </button>

                    {multi && (
                        <span className={styles.counter} aria-live="polite">
                            {idx + 1}/{total}
                        </span>
                    )}

                    {isVideo ? (
                        <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={onMuteClick}
                            aria-label={muted ? "Unmute video" : "Mute video"}
                            aria-pressed={!muted}
                        >
                            <Icon icon={muted ? "mdi:volume-off" : "mdi:volume-high"} width={22} height={22} />
                        </button>
                    ) : (
                        <span className={styles.iconSpacer} aria-hidden="true" />
                    )}
                </div>

                {/* ── Desktop prev / next ── */}
                {multi && idx > 0 && (
                    <button
                        className={`${styles.nav} ${styles.navPrev}`}
                        type="button"
                        aria-label="Previous"
                        onClick={() => go(idx - 1)}
                    >
                        <Icon icon="mdi:chevron-left" width={28} height={28} />
                    </button>
                )}
                {multi && idx < total - 1 && (
                    <button
                        className={`${styles.nav} ${styles.navNext}`}
                        type="button"
                        aria-label="Next"
                        onClick={() => go(idx + 1)}
                    >
                        <Icon icon="mdi:chevron-right" width={28} height={28} />
                    </button>
                )}
            </div>
        </Portal>
    )
}

// ── Image slide ───────────────────────────────────────────────

/**
 * One photo: the zoom container spreads useZoomPan's props (including
 * `data-allow-touchmove`, which lets the pinch through the page scroll lock)
 * and the <img> carries the transform.
 */
function ImageSlide({
    item,
    zoom,
}: {
    item: MediaLightboxItem
    zoom: ReturnType<typeof useZoomPan>
}) {
    const src = useProgressiveSrc(item)
    const { containerProps, attachMedia, mediaStyle, isZoomed, cursor } = zoom

    return (
        <div
            {...containerProps}
            className={`${styles.slide} ${isZoomed ? styles.slideZoomed : ""}`}
            style={{ cursor }}
        >
            {/* Plain <img>: the src is on the media domain, and next/image
                would need it in remotePatterns for no gain on a full-bleed
                image that is already the right size. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                ref={attachMedia}
                src={src}
                alt=""
                className={styles.img}
                style={mediaStyle}
                draggable={false}
            />
        </div>
    )
}
