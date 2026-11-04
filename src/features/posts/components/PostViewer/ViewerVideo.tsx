"use client"

/**
 * ViewerVideo — the full-screen player, moved here from MediaCarousel's
 * lightbox (where it was LightboxVideo).
 *
 * Native `controls` were replaced because every browser draws them
 * differently and none of them match the app; this also lets the element go
 * through useAdaptiveVideo like every other surface.
 *
 * Two chromes over the same element:
 *   "bar"     — the desktop control bar (play, clock, seek, mute).
 *   "minimal" — the phone's thin progress line; play/pause and mute live in
 *               the layout (a tap on the media, the top-bar button) and reach
 *               the element through `apiRef`.
 *
 * The element itself never handles clicks: ViewerMedia owns the tap so a
 * double-tap can be a like without also pausing twice.
 *
 * WARM OR ACTIVE, the same element. A neighbouring page mounts this warm: muted,
 * paused, its source attached and loading. Swiping to it flips `active`; nothing
 * remounts, so what it loaded is what plays. The poster sits above the video
 * until a frame is really painted, and a blurred copy behind both means there is
 * never a flat black box. See "Video playback" in CLAUDE.md.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import { useAdaptiveVideo } from "@/shared/hooks/useAdaptiveVideo"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import { firstFrameSrc, releaseVideoElement, whenFirstFrame } from "@/shared/media/playback"
import { hlsSrc, posterSrc, videoSrc } from "@/shared/services/mediaDelivery"
import type { WarmPreload } from "./viewerList"
import styles from "./ViewerVideo.module.css"

/** What the viewer's keyboard shortcuts and tap handlers drive. */
export type ViewerVideoApi = {
    togglePlay: () => void
    toggleMute: () => void
    seekBy: (seconds: number) => void
}

/** Controls fade this long after the last interaction — only while playing. */
const CONTROLS_HIDE_MS = 2500

/** The tap-feedback icon stays this long. */
const FLASH_MS = 600

function fmtDuration(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}

/** Playhead clock. `duration` is NaN before metadata and Infinity for streams. */
function fmtClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
    return fmtDuration(Math.floor(seconds))
}

interface ViewerVideoProps {
    item: PostMedia
    /** Non-null only while this slide is mounted — the keyboard handler's cue. */
    apiRef: RefObject<ViewerVideoApi | null>
    controls: "bar" | "minimal"
    /** On screen and playing. False: warm, loading, silent, drawing no chrome. */
    active?: boolean
    /** How much a warm element fetches. */
    warm?: WarmPreload
}

export default function ViewerVideo({
    item,
    apiRef,
    controls,
    active = true,
    warm = "auto",
}: ViewerVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const poster = posterSrc(item) || undefined
    const [paused, setPaused] = useState(false)
    // A frame has been painted while playing; the poster layer can go.
    const [frameShown, setFrameShown] = useState(false)
    // Inherits the GLOBAL sound state rather than opening unmuted on its own.
    // Deliberate change: the lightbox used to be the one surface that started
    // with sound, so opening it from a muted feed was a jump-scare and muting
    // it never carried back out.
    const { muted, toggleMuted, applyMuted, mutedRef, reportBlocked } = useVideoSound(videoRef)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    // "minimal": the icon flashed in the middle after a tap.
    const [flash, setFlash] = useState<"play" | "pause" | null>(null)

    const pausedRef = useRef(false)
    const hideTimerRef = useRef<number | null>(null)
    const flashTimerRef = useRef<number | null>(null)
    const autoPlayedRef = useRef(false)

    // Read from the one-shot play below, which must not run for a warm element
    // however late its `canplay` arrives.
    const activeRef = useRef(active)

    // Fullscreen buffers normally — no maxBufferLength. The hook owns video.src.
    useAdaptiveVideo(videoRef, {
        hlsSrc: hlsSrc(),
        mp4Src: firstFrameSrc(videoSrc(item), Boolean(poster)),
    })

    const showControls = useCallback(() => {
        setControlsVisible(true)
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = window.setTimeout(() => {
            // Paused → nothing is moving, so leave them up.
            if (!pausedRef.current) setControlsVisible(false)
        }, CONTROLS_HIDE_MS)
    }, [])

    useEffect(() => () => {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
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
            el.play().catch(() => { })
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

    const seekBy = useCallback((seconds: number) => {
        const el = videoRef.current
        if (!el || !Number.isFinite(el.duration)) return
        el.currentTime = Math.max(
            0,
            Math.min(el.duration, el.currentTime + seconds)
        )
        showControls()
    }, [showControls])

    // Publish the handle for the viewer's keydown listener and tap handler. Only
    // the slide on screen answers to them.
    useEffect(() => {
        if (!active) return
        apiRef.current = { togglePlay, toggleMute, seekBy }
        return () => { apiRef.current = null }
    }, [active, apiRef, togglePlay, toggleMute, seekBy])

    // Closing the viewer or leaving the warm window unmounts this — stop the
    // audio, and give the source back rather than trusting the browser to free
    // the decoder of a detached element for us.
    useEffect(() => {
        const el = videoRef.current
        return () => { if (el) releaseVideoElement(el) }
    }, [])

    // One-shot per activation: try unmuted, and if the browser refuses take
    // muted playback. Called on activation, and again on `canplay` for a play()
    // a new source interrupted.
    const startPlaying = useCallback(() => {
        const el = videoRef.current
        if (!el || !activeRef.current || autoPlayedRef.current) return
        autoPlayedRef.current = true
        Promise.resolve(el.play()).catch((err: unknown) => {
            if ((err as { name?: string } | null)?.name === "AbortError") {
                autoPlayedRef.current = false
                return
            }
            // The opening gesture can expire while the source attaches (dynamic
            // import + manifest fetch). Muted playback is always allowed — take
            // it, and move EVERY icon in the app so none of them are lying.
            applyMuted(true)
            reportBlocked()
            Promise.resolve(el.play()).catch(() => { })
        })
    }, [applyMuted, reportBlocked])

    // Warm ↔ active, on the same element.
    useEffect(() => {
        activeRef.current = active
        const el = videoRef.current
        if (!el) return

        if (active) {
            autoPlayedRef.current = false
            // Before play(): the autoplay policy reads the property.
            applyMuted(mutedRef.current)
            startPlaying()
            return
        }
        el.pause()
        // Coming back to a page starts it over. On its frame, not on black.
        if (el.readyState > 0) el.currentTime = 0
    }, [active, applyMuted, mutedRef, startPlaying])

    // useVideoSound follows the global state; a warm element stays silent
    // whatever that is, even though nothing should ever play it.
    useEffect(() => {
        if (!active && videoRef.current) videoRef.current.muted = true
    }, [active, muted])

    useEffect(() => {
        const el = videoRef.current
        if (!el || frameShown) return
        return whenFirstFrame(el, () => setFrameShown(true))
    }, [frameShown])

    const seekMax = duration || 0
    const progress = seekMax > 0 ? Math.min(1, currentTime / seekMax) : 0

    return (
        <div
            className={`${styles.wrap} ${controls === "bar" ? styles.wrapBar : styles.wrapMinimal}`}
            onMouseMove={active && controls === "bar" ? showControls : undefined}
            onTouchStart={active && controls === "bar" ? showControls : undefined}
        >
          {/* Ambient fill behind everything: the letterbox is this clip, blurred
              and darkened, not a black box. */}
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" aria-hidden="true" className={styles.ambient} draggable={false} />
          )}
          {/* Shrink-wraps the video so the control bar lines up with the
              frame's bottom edge rather than the stage's. */}
          <div className={styles.frame}>
            <video
                ref={videoRef}
                // No src / no controls: useAdaptiveVideo attaches the source and
                // the chrome below replaces the browser's. The poster attribute
                // stays alongside the layer below: on desktop it is what sizes
                // the frame before metadata arrives.
                className={styles.video}
                poster={poster}
                preload={active ? "auto" : warm}
                data-viewer-video={active ? "active" : "warm"}
                // BARE `muted`, never muted={muted}: the server-rendered
                // markup and first client paint must always be muted, and
                // useVideoSound sets the property after mount.
                muted
                playsInline
                onCanPlay={startPlaying}
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

            {/* The same URL the feed used, so it is already cached. iOS drops a
                `poster` attribute before the first frame is up; this stays. */}
            {poster && !frameShown && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={poster}
                    alt=""
                    aria-hidden="true"
                    className={styles.poster}
                    draggable={false}
                    data-viewer-poster=""
                />
            )}

            {flash && (
                <span className={styles.flash} aria-hidden="true">
                    <Icon icon={flash === "play" ? "mdi:play" : "mdi:pause"} width={40} height={40} />
                </span>
            )}

            {!active ? null : controls === "minimal" ? (
                /* Phone: a hairline of progress along the bottom edge. */
                <div className={styles.progress} aria-hidden="true">
                    <span
                        className={styles.progressFill}
                        style={{ transform: `scaleX(${progress})` }}
                    />
                </div>
            ) : (
                <div
                    className={`${styles.controls} ${controlsVisible ? "" : styles.controlsHidden}`}
                    /* Clicks on the bar must not reach the media's tap handler. */
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

                    <button
                        type="button"
                        className={styles.ctrlBtn}
                        onClick={toggleMute}
                        aria-label={muted ? "Unmute video" : "Mute video"}
                        aria-pressed={!muted}
                    >
                        <Icon
                            icon={muted ? "mdi:volume-off" : "mdi:volume-high"}
                            width={20}
                            height={20}
                        />
                    </button>
                </div>
            )}
          </div>
        </div>
    )
}
