"use client"

/**
 * MediaCarousel
 *
 * Inline feed  → ONE clamped aspect-ratio container (getPostAspectRatio), shared
 *                by every slide, object-fit: cover, centered. Space is reserved
 *                before media loads → zero layout shift; a neutral skeleton fills
 *                the box while loading.
 * Fullscreen   → portal lightbox showing the UNCROPPED original (object-fit:
 *                contain, black background) with zoom/pan. The mobile back
 *                button/gesture closes the viewer instead of navigating away.
 * Video        → same clamped container + cover; autoplays only when visible
 *                (IntersectionObserver), muted; lightbox shows it with contain.
 */

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import { getPostAspectRatio } from "@/features/posts/utils/media"
import { useAdaptiveVideo } from "@/shared/hooks/useAdaptiveVideo"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import {
    videoDeliveryUrl,
    videoHlsUrl,
    videoPosterUrl,
} from "@/shared/services/cloudinaryDelivery"
import styles from "./MediaCarousel.module.css"

// ── Helpers ───────────────────────────────────────────────────

/**
 * How far ahead a feed video may buffer. Deliberately small: a post the user
 * scrolls straight past should not have downloaded a minute of video first.
 * The fullscreen surfaces (highlights) leave this unset and buffer normally.
 */
const FEED_MAX_BUFFER_SECONDS = 10

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

// ── Lazy media item ───────────────────────────────────────────

function LazyImage({
    src,
    alt,
}: {
    src: string
    alt: string
}) {
    const [loaded, setLoaded] = useState(false)
    const [inView, setInView] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
            { rootMargin: "200px" }
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    return (
        <div ref={ref} className={styles.mediaItem}>
            {!loaded && <div className={styles.mediaSkeleton} />}
            {inView && (
                <img
                    src={src}
                    alt={alt}
                    className={`${styles.mediaImg} ${loaded ? styles.mediaImgLoaded : ""}`}
                    onLoad={() => setLoaded(true)}
                    loading="lazy"
                    decoding="async"
                />
            )}
        </div>
    )
}

// ── Video item (autoplay on visible) ──────────────────────────
function LazyVideo({
    src,
    hlsSrc,
    thumbnail,
    duration,
}: {
    src: string
    hlsSrc?: string
    thumbnail?: string
    duration?: number | null
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [playing, setPlaying] = useState(false)
    const [videoReady, setVideoReady] = useState(false)
    // Flipped once by the observer, the first time this post reaches the
    // viewport. Until then the hook stays on the plain mp4 src and, with
    // preload="none", fetches nothing at all — the feed's lazy contract.
    const [activated, setActivated] = useState(false)

    // Sound is GLOBAL (src/store/sound.store.ts) — unmute one video and every
    // video in the app plays with sound until the user mutes again. The hook
    // still pushes the state onto the element as a PROPERTY, which is what the
    // autoplay policy reads, and still exposes a ref because the observer's
    // callback below is created once.
    const {
        muted,
        toggleMuted,
        applyMuted,
        mutedRef,
        reportBlocked,
    } = useVideoSound(videoRef)

    // Owns video.src (hence no src attribute below) — hls.js attaches through
    // MediaSource, which a React-controlled src would fight every render.
    useAdaptiveVideo(videoRef, {
        hlsSrc,
        mp4Src: src,
        enabled: activated,
        maxBufferLength: FEED_MAX_BUFFER_SECONDS,
    })

    const toggleMute = useCallback((e: React.MouseEvent) => {
        // The tile wrapper opens the lightbox on click — this button must not
        // reach it, which is the whole reason the old badge was unusable.
        e.stopPropagation()
        // Apply to THIS element in the same tick as well as through the store:
        // the tap is the user gesture the autoplay policy is waiting for, and
        // waiting a render for the effect would spend it.
        applyMuted(!mutedRef.current)
        toggleMuted()
    }, [applyMuted, mutedRef, toggleMuted])

    useEffect(() => {
        const el = videoRef.current
        if (!el) return

        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.intersectionRatio >= 0.5) {
                    // First time on screen: let the hook upgrade this element to
                    // the adaptive ladder. State updates from here are batched,
                    // so play() below still runs first and the hook can see that
                    // playback was wanted across the source swap.
                    setActivated(true)
                    // Before ANY play(): the policy check reads the property.
                    applyMuted(mutedRef.current)
                    // Trigger load if not already loading (preload="none" means
                    // nothing is fetched until the video actually scrolls in).
                    if (el.readyState === 0) {
                        el.load()
                    }
                    el.play().catch(() => {
                        // Scrolled into view while unmuted and the browser
                        // refused. Autoplay always beats sound: drop to muted,
                        // retry once, and move EVERY icon in the app so none
                        // of them are lying about the state.
                        if (el.muted) return
                        applyMuted(true)
                        reportBlocked()
                        el.play().catch(() => { })
                    })
                    setPlaying(true)
                } else {
                    // Scrolled away → PAUSE so an off-screen video never keeps
                    // playing or buffering in the background. The 50% threshold
                    // fires while the item is still near the viewport, before
                    // content-visibility:auto skips its rendering.
                    el.pause()
                    setPlaying(false)
                }
            },
            { threshold: 0.5 }
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [applyMuted, mutedRef, reportBlocked])

    return (
        <div className={`${styles.mediaItem} ${styles.videoItem}`}>
            {/* Thumbnail shown only until video has rendered its first frame */}
            {!videoReady && thumbnail && (
                <img
                    src={thumbnail}
                    alt="Video thumbnail"
                    className={styles.mediaImg}
                    style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 1 }}
                />
            )}
            <video
                ref={videoRef}
                className={styles.mediaImg}
                style={{ opacity: videoReady ? 1 : 0, transition: "opacity 0.2s" }}
                muted
                playsInline
                loop
                // preload="none": off-screen videos fetch nothing. Dimensions come
                // from the CSS-sized container and the poster shows the thumbnail,
                // so no metadata is needed until the observer calls load()/play().
                preload="none"
                poster={thumbnail}
                // `canplay` used to drive this swap, but on iOS Safari it can
                // fire before the first frame is actually composited — the
                // thumbnail disappears onto a black box for a frame or two.
                // `playing` only fires once playback is genuinely running, and
                // the timeupdate guard covers the browsers that skip it.
                onPlaying={() => setVideoReady(true)}
                onTimeUpdate={(e) => {
                    if (!videoReady && e.currentTarget.currentTime > 0)
                        setVideoReady(true)
                }}
            />
            {!playing && (
                <div className={styles.videoPlayOverlay} style={{ zIndex: 2 }}>
                    <span className={styles.videoPlayBtn}>
                        <Icon icon="mdi:play" width={28} height={28} />
                    </span>
                    {duration && (
                        <span className={styles.videoDuration}>{fmtDuration(duration)}</span>
                    )}
                </div>
            )}
            {playing && (
                <button
                    type="button"
                    className={styles.videoMuteBtn}
                    onClick={toggleMute}
                    aria-label={muted ? "Unmute video" : "Mute video"}
                    aria-pressed={!muted}
                >
                    <span className={styles.videoMuteBtnInner}>
                        <Icon
                            icon={muted ? "mdi:volume-off" : "mdi:volume-high"}
                            width={12}
                            height={12}
                        />
                    </span>
                </button>
            )}
        </div>
    )
}
// ── Fullscreen video (custom controls) ────────────────────────

/** What the lightbox's keyboard shortcuts drive. Null unless a video is up. */
type LightboxVideoApi = {
    togglePlay: () => void
    toggleMute: () => void
    seekBy: (seconds: number) => void
}

/** Controls fade this long after the last interaction — only while playing. */
const CONTROLS_HIDE_MS = 2500

/**
 * The fullscreen player. Native `controls` were replaced because every browser
 * draws them differently and none of them match the app; this also lets the
 * element go through useAdaptiveVideo like every other surface.
 */
function LightboxVideo({
    item,
    apiRef,
}: {
    item: PostMedia
    apiRef: RefObject<LightboxVideoApi | null>
}) {
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

    const pausedRef = useRef(false)
    const hideTimerRef = useRef<number | null>(null)
    const autoPlayedRef = useRef(false)

    // Fullscreen buffers normally — no maxBufferLength. The hook owns video.src.
    useAdaptiveVideo(videoRef, {
        hlsSrc: videoHlsUrl(item.file_url),
        mp4Src: videoDeliveryUrl(item.file_url),
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
    }, [])

    const togglePlay = useCallback(() => {
        const el = videoRef.current
        if (!el) return
        if (el.paused) el.play().catch(() => { })
        else el.pause()
        showControls()
    }, [showControls])

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

    // Publish the handle for the lightbox's keydown listener.
    useEffect(() => {
        apiRef.current = { togglePlay, toggleMute, seekBy }
        return () => { apiRef.current = null }
    }, [apiRef, togglePlay, toggleMute, seekBy])

    // Closing the lightbox or changing slide unmounts this — stop the audio
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

    return (
        <div
            className={styles.lightboxVideoWrap}
            onMouseMove={showControls}
            onTouchStart={showControls}
        >
            <video
                ref={videoRef}
                // No src / no controls: useAdaptiveVideo attaches the source and
                // the bar below replaces the browser's chrome.
                className={`${styles.lightboxImg} ${styles.lightboxVideo}`}
                poster={
                    item.thumbnail_url
                        ? videoPosterUrl(item.thumbnail_url)
                        : undefined
                }
                autoPlay
                // BARE `muted`, never muted={muted}: the server-rendered
                // markup and first client paint must always be muted, and
                // useVideoSound sets the property after mount.
                muted
                playsInline
                onClick={togglePlay}
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

            <div
                className={`${styles.videoControls} ${controlsVisible ? "" : styles.videoControlsHidden}`}
                /* Clicks on the bar must not reach the video's play/pause. */
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className={styles.videoCtrlBtn}
                    onClick={togglePlay}
                    aria-label={paused ? "Play video" : "Pause video"}
                >
                    <Icon icon={paused ? "mdi:play" : "mdi:pause"} width={20} height={20} />
                </button>

                <span className={styles.videoTime}>
                    {fmtClock(currentTime)} / {fmtClock(duration)}
                </span>

                <input
                    type="range"
                    className={styles.videoSeek}
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
                    className={styles.videoCtrlBtn}
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
        </div>
    )
}

// ── Fullscreen lightbox ───────────────────────────────────────
function Lightbox({
  media,
  startIndex,
  onClose,
}: {
  media: PostMedia[]
  startIndex: number
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [idx, setIdx] = useState(startIndex)

  // ── Zoom state ──────────────────────────────────────────────
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const lastTap = useRef(0)
  const lastPinchDist = useRef<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Non-null only while a video slide is mounted — which is exactly the
  // condition the keyboard handler needs to decide what an arrow key means.
  const videoApiRef = useRef<LightboxVideoApi | null>(null)

  const current = media[idx]
  const isZoomed = scale > 1
  const isImage = current.media_type === "image"

  // ── Back-button / gesture handling ──────────────────────────
  // Keep onClose reachable from the one-shot history effect without making it a
  // dependency (callers pass a fresh arrow each render).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const pushedRef = useRef(false)

  useEffect(() => {
    // Reserve ONE history entry so the mobile back button/gesture closes the
    // viewer instead of navigating away. Guarded with a ref so React
    // StrictMode's double-invoked effect (dev) pushes only once — and, crucially,
    // the cleanup never calls history.back(), which on the StrictMode
    // mount→cleanup→mount cycle would pop our entry and close the lightbox the
    // instant it opened. Explicit closes go through requestClose() → back().
    if (!pushedRef.current) {
      window.history.pushState({ goatzaLightbox: true }, "")
      pushedRef.current = true
    }
    const onPop = () => onCloseRef.current()
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Route every in-app close through the back stack so the button, Esc, backdrop
  // and the hardware back gesture all behave identically.
  const requestClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.goatzaLightbox) {
      window.history.back()   // → popstate → onClose
    } else {
      onCloseRef.current()
    }
  }, [])

  // Reset zoom when slide changes
  const resetZoom = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => { resetZoom() }, [idx, resetZoom])

  useEffect(() => { setMounted(true) }, [])

  // Clamp offset so image doesn't pan beyond its edges
  const clampOffset = useCallback(
    (ox: number, oy: number, currentScale: number) => {
      const el = imgRef.current
      if (!el) return { x: ox, y: oy }
      const maxX = (el.offsetWidth * (currentScale - 1)) / 2
      const maxY = (el.offsetHeight * (currentScale - 1)) / 2
      return {
        x: Math.max(-maxX, Math.min(maxX, ox)),
        y: Math.max(-maxY, Math.min(maxY, oy)),
      }
    },
    []
  )

  // ── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (isZoomed) resetZoom(); else requestClose(); return }

      // Video slide → the arrows mean "seek", not "next photo". Images keep
      // navigating exactly as before. Skipped while the seek bar itself has
      // focus, so its native arrow handling isn't doubled up.
      const video = videoApiRef.current
      const onSeekBar = (e.target as HTMLElement | null)?.tagName === "INPUT"
      if (video && !onSeekBar) {
        if (e.key === " " || e.key === "k" || e.key === "K") {
          e.preventDefault()   // also stops the page scrolling on Space
          video.togglePlay()
          return
        }
        if (e.key === "m" || e.key === "M") { video.toggleMute(); return }
        if (e.key === "ArrowRight") { e.preventDefault(); video.seekBy(5); return }
        if (e.key === "ArrowLeft") { e.preventDefault(); video.seekBy(-5); return }
      }

      if (e.key === "ArrowRight" && !isZoomed) setIdx((i) => Math.min(i + 1, media.length - 1))
      if (e.key === "ArrowLeft"  && !isZoomed) setIdx((i) => Math.max(i - 1, 0))
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.5, 4))
      if (e.key === "-") setScale((s) => { const ns = Math.max(s - 0.5, 1); if (ns === 1) setOffset({ x: 0, y: 0 }); return ns })
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [media.length, requestClose, isZoomed, resetZoom])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  // ── Mouse wheel zoom ────────────────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isImage) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      setScale((prev) => {
        const next = Math.max(1, Math.min(4, prev + delta))
        if (next === 1) setOffset({ x: 0, y: 0 })
        return next
      })
    },
    [isImage]
  )

  // ── Double-click / double-tap to zoom ────────────────────────
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isImage) return
      e.stopPropagation()
      if (isZoomed) {
        resetZoom()
      } else {
        // Zoom into the clicked point
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        const newScale = 2.5
        const clamped = clampOffset(-cx * (newScale - 1), -cy * (newScale - 1), newScale)
        setScale(newScale)
        setOffset(clamped)
      }
    },
    [isImage, isZoomed, resetZoom, clampOffset]
  )

  // ── Mouse drag (when zoomed) ─────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isZoomed || !isImage) return
      e.preventDefault()
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    },
    [isZoomed, isImage, offset]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
    },
    [isDragging, scale, clampOffset]
  )

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  // ── Touch: pinch zoom + drag ─────────────────────────────────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isImage) return
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist.current = Math.hypot(dx, dy)
      } else if (e.touches.length === 1) {
        // Double-tap detection
        const now = Date.now()
        if (now - lastTap.current < 280) {
          if (isZoomed) {
            resetZoom()
          } else {
            setScale(2.5)
          }
        }
        lastTap.current = now

        if (isZoomed) {
          dragStart.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            ox: offset.x,
            oy: offset.y,
          }
          setIsDragging(true)
        }
      }
    },
    [isImage, isZoomed, resetZoom, offset]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isImage) return
      e.stopPropagation()

      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        const delta = dist / lastPinchDist.current
        lastPinchDist.current = dist
        setScale((prev) => {
          const next = Math.max(1, Math.min(4, prev * delta))
          if (next === 1) setOffset({ x: 0, y: 0 })
          return next
        })
      } else if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - dragStart.current.x
        const dy = e.touches[0].clientY - dragStart.current.y
        setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
      }
    },
    [isImage, isDragging, scale, clampOffset]
  )

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null
    setIsDragging(false)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Media viewer">
      {/* Backdrop — only close if not zoomed */}
      <div
        className={styles.lightboxBg}
        onClick={() => { if (!isZoomed) requestClose() }}
      />

      {/* Close */}
      <button className={styles.lightboxClose} onClick={requestClose} type="button" aria-label="Close">
        <Icon icon="mdi:close" width={24} height={24} />
      </button>

      {/* Counter */}
      {media.length > 1 && (
        <div className={styles.lightboxCounter}>{idx + 1} / {media.length}</div>
      )}

      {/* Zoom indicator */}
      {isImage && isZoomed && (
        <div className={styles.zoomIndicator}>
          <Icon icon="mdi:magnify" width={13} height={13} />
          {Math.round(scale * 100)}%
          <button className={styles.zoomResetBtn} onClick={resetZoom} type="button">
            Reset
          </button>
        </div>
      )}

      {/* Zoom hint (only at scale=1, first few seconds) */}
      {isImage && !isZoomed && (
        <div className={styles.zoomHint}>
          <Icon icon="mdi:gesture-pinch" width={13} height={13} />
          Pinch or scroll to zoom · Double-tap to zoom in
        </div>
      )}

      {/* Media container */}
      <div
        ref={containerRef}
        className={`${styles.lightboxMedia} ${isImage && isZoomed ? styles.lightboxMediaZoomed : ""}`}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: !isImage ? "default" : isZoomed ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
      >
        {current.media_type === "video" ? (
          /* key: a slide change gets a fresh element, and unmounting the old
             one is what stops its audio. */
          <LightboxVideo key={current.id} item={current} apiRef={videoApiRef} />
        ) : (
          <img
            ref={imgRef}
            src={current.file_url}
            alt=""
            className={styles.lightboxImg}
            style={{
              transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
              transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.22,1,0.36,1)",
              transformOrigin: "center center",
              willChange: "transform",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: isZoomed ? "none" : "auto",
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Prev / Next — hidden when zoomed */}
      {!isZoomed && idx > 0 && (
        <button
          className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
          onClick={() => setIdx((i) => i - 1)}
          type="button"
          aria-label="Previous"
        >
          <Icon icon="mdi:chevron-left" width={28} height={28} />
        </button>
      )}
      {!isZoomed && idx < media.length - 1 && (
        <button
          className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
          onClick={() => setIdx((i) => i + 1)}
          type="button"
          aria-label="Next"
        >
          <Icon icon="mdi:chevron-right" width={28} height={28} />
        </button>
      )}

      {/* Dot indicators — hidden when zoomed */}
      {!isZoomed && media.length > 1 && (
        <div className={styles.lightboxDots}>
          {media.map((_, i) => (
            <button
              key={i}
              className={`${styles.lightboxDot} ${i === idx ? styles.lightboxDotActive : ""}`}
              onClick={() => setIdx(i)}
              type="button"
              aria-label={`Go to ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

// ── Main MediaCarousel ────────────────────────────────────────

interface MediaCarouselProps {
    media: PostMedia[]
    postId: string
}

export default function MediaCarousel({ media, postId }: MediaCarouselProps) {
    const [slideIdx, setSlideIdx] = useState(0)
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

    // Touch swipe
    const touchStartX = useRef<number>(0)
    const trackRef = useRef<HTMLDivElement>(null)

    const isSingle = media.length === 1
    const totalSlides = media.length

    const goTo = useCallback((i: number) => {
        setSlideIdx(Math.max(0, Math.min(i, totalSlides - 1)))
    }, [totalSlides])

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX
        if (Math.abs(diff) > 40) goTo(slideIdx + (diff > 0 ? 1 : -1))
    }

    if (media.length === 0) return null

    const sorted = [...media].sort((a, b) => a.order - b.order)

    // One clamped ratio (from the first slide) drives the whole carousel so
    // every slide shares an identical, space-reserved box → no layout shift.
    const ratio = getPostAspectRatio(sorted)

    return (
        <>
            <div
                className={styles.carousel}
                style={{ aspectRatio: ratio }}
            >

                {/* Track */}
                <div
                    ref={trackRef}
                    className={styles.track}
                    style={{ transform: `translateX(-${slideIdx * 100}%)` }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {sorted.map((item, i) => (
                        <div
                            key={`${postId}-${i}`}
                            className={styles.slide}
                            onClick={() => setLightboxIdx(i)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && setLightboxIdx(i)}
                            aria-label={`View ${item.media_type} ${i + 1} of ${sorted.length} full screen`}
                        >
                            {item.media_type === "video" ? (
                                <LazyVideo
                                    src={videoDeliveryUrl(item.file_url)}
                                    hlsSrc={videoHlsUrl(item.file_url)}
                                    thumbnail={
                                        item.thumbnail_url
                                            ? videoPosterUrl(item.thumbnail_url)
                                            : undefined
                                    }
                                    duration={item.duration}
                                />
                            ) : (
                                <LazyImage
                                    src={item.file_url}
                                    alt={`Media ${i + 1}`}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Prev / Next arrows (multi only, desktop) */}
                {!isSingle && slideIdx > 0 && (
                    <button
                        className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`}
                        onClick={(e) => { e.stopPropagation(); goTo(slideIdx - 1) }}
                        type="button"
                        aria-label="Previous"
                    >
                        <Icon icon="mdi:chevron-left" width={20} height={20} />
                    </button>
                )}
                {!isSingle && slideIdx < totalSlides - 1 && (
                    <button
                        className={`${styles.carouselBtn} ${styles.carouselBtnNext}`}
                        onClick={(e) => { e.stopPropagation(); goTo(slideIdx + 1) }}
                        type="button"
                        aria-label="Next"
                    >
                        <Icon icon="mdi:chevron-right" width={20} height={20} />
                    </button>
                )}

                {/* Dot indicators (multi) */}
                {!isSingle && (
                    <div className={styles.dots}>
                        {sorted.map((_, i) => (
                            <button
                                key={i}
                                className={`${styles.dot} ${i === slideIdx ? styles.dotActive : ""}`}
                                onClick={(e) => { e.stopPropagation(); goTo(i) }}
                                type="button"
                                aria-label={`Slide ${i + 1}`}
                            />
                        ))}
                    </div>
                )}

                {/* Fullscreen button */}
                <button
                    className={styles.fullscreenBtn}
                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(slideIdx) }}
                    type="button"
                    aria-label="View fullscreen"
                >
                    <Icon icon="mdi:fullscreen" width={16} height={16} />
                </button>

                {/* Slide counter (multi) */}
                {!isSingle && (
                    <div className={styles.slideCounter}>
                        {slideIdx + 1}/{totalSlides}
                    </div>
                )}

            </div>

            {/* Lightbox */}
            {lightboxIdx !== null && (
                <Lightbox
                    media={sorted}
                    startIndex={lightboxIdx}
                    onClose={() => setLightboxIdx(null)}
                />
            )}
        </>
    )
}
