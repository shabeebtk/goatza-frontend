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
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import { useAdaptiveVideo } from "@/shared/hooks/useAdaptiveVideo"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import { hlsSrc, posterSrc, videoSrc } from "@/shared/services/mediaDelivery"
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
}

export default function ViewerVideo({ item, apiRef, controls }: ViewerVideoProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [paused, setPaused] = useState(false)
    // Inherits the GLOBAL sound state rather than opening unmuted on its own.
    // Deliberate change: the lightbox used to be the one surface that started
    // with sound, so opening it from a muted feed was a jump-scare and muting
    // it never carried back out.
    const { muted, toggleMuted, applyMuted, reportBlocked } = useVideoSound(videoRef)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    // "minimal": the icon flashed in the middle after a tap.
    const [flash, setFlash] = useState<"play" | "pause" | null>(null)

    const pausedRef = useRef(false)
    const hideTimerRef = useRef<number | null>(null)
    const flashTimerRef = useRef<number | null>(null)
    const autoPlayedRef = useRef(false)

    // Fullscreen buffers normally — no maxBufferLength. The hook owns video.src.
    useAdaptiveVideo(videoRef, {
        hlsSrc: hlsSrc(),
        mp4Src: videoSrc(item),
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

    // Publish the handle for the viewer's keydown listener and tap handler.
    useEffect(() => {
        apiRef.current = { togglePlay, toggleMute, seekBy }
        return () => { apiRef.current = null }
    }, [apiRef, togglePlay, toggleMute, seekBy])

    // Closing the viewer or changing slide unmounts this — stop the audio
    // rather than trusting the browser to pause a detached element for us.
    useEffect(() => {
        const el = videoRef.current
        return () => { el?.pause() }
    }, [])

    // One-shot: try unmuted, and if the browser refuses take muted playback.
    const onCanPlay = useCallback(() => {
        const el = videoRef.current
        if (!el || autoPlayedRef.current) return
        autoPlayedRef.current = true
        el.play().catch(() => {
            // The opening gesture can expire while the source attaches (dynamic
            // import + manifest fetch). Muted playback is always allowed — take
            // it, and move EVERY icon in the app so none of them are lying.
            applyMuted(true)
            reportBlocked()
            el.play().catch(() => { })
        })
    }, [applyMuted, reportBlocked])

    const seekMax = duration || 0
    const progress = seekMax > 0 ? Math.min(1, currentTime / seekMax) : 0

    return (
        <div
            className={`${styles.wrap} ${controls === "bar" ? styles.wrapBar : styles.wrapMinimal}`}
            onMouseMove={controls === "bar" ? showControls : undefined}
            onTouchStart={controls === "bar" ? showControls : undefined}
        >
          {/* Shrink-wraps the video so the control bar lines up with the
              frame's bottom edge rather than the stage's. */}
          <div className={styles.frame}>
            <video
                ref={videoRef}
                // No src / no controls: useAdaptiveVideo attaches the source and
                // the chrome below replaces the browser's.
                className={styles.video}
                poster={posterSrc(item) || undefined}
                autoPlay
                // BARE `muted`, never muted={muted}: the server-rendered
                // markup and first client paint must always be muted, and
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

            {controls === "minimal" ? (
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
