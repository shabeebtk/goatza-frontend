"use client"

/**
 * MediaCarousel
 *
 * Inline feed  → ONE clamped aspect-ratio container (getPostAspectRatio), shared
 *                by every slide, object-fit: cover, centered. Space is reserved
 *                before media loads → zero layout shift; a neutral skeleton fills
 *                the box while loading.
 * Fullscreen   → not here any more. A tap on a slide or the fullscreen button
 *                calls `onOpenViewer(slideIndex)` and PostCard opens the
 *                PostViewer (uncropped original, zoom/pan, comments, actions).
 * Video        → same clamped container + cover; which video plays, what loads
 *                and what is given back is shared/media/playback.ts, not this
 *                file. It just plays: no play button, and the thumbnail stays
 *                until a frame is really on screen. The viewer shows it with
 *                contain.
 * Loading      → a still thumbnail looks stuck, so media the reader is really
 *                waiting for gets MediaLoading on top of it. Only then: never on
 *                a tile that is warming up off screen.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import { getPostAspectRatio } from "@/features/posts/utils/media"
import MediaLoading from "@/shared/components/ui/MediaLoading/MediaLoading"
import { useAdaptiveVideo } from "@/shared/hooks/useAdaptiveVideo"
import { useVideoLoading } from "@/shared/hooks/useVideoLoading"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
import {
    firstFrameSrc,
    lookAheadTarget,
    useAutoplayVideo,
    whenFirstFrame,
} from "@/shared/media/playback"
import {
    hlsSrc,
    posterSrc,
    thumbSrc,
    videoSrc,
} from "@/shared/services/mediaDelivery"
import { usePostViewerStore } from "@/store/postViewer.store"
import styles from "./MediaCarousel.module.css"

// ── Helpers ───────────────────────────────────────────────────

/**
 * How far ahead a feed video may buffer. Deliberately small: a post the user
 * scrolls straight past should not have downloaded a minute of video first.
 * The fullscreen surfaces (highlights) leave this unset and buffer normally.
 */
const FEED_MAX_BUFFER_SECONDS = 10

/** A photo starts loading about one and a half screens before it arrives. */
const IMAGE_LOOK_AHEAD = "0px 0px 150% 0px"

/** Half of it showing: the reader is looking at the wait. */
const IMAGE_ON_SCREEN_RATIO = 0.5

const NETWORK_LOADING = 2

function fmtDuration(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
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
    const [failed, setFailed] = useState(false)
    const [inView, setInView] = useState(false)
    const [onScreen, setOnScreen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const pending = !loaded && !failed

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
            { rootMargin: IMAGE_LOOK_AHEAD }
        )
        obs.observe(lookAheadTarget(el))
        return () => obs.disconnect()
    }, [])

    // The tile itself, unlike the look-ahead: a card that is on screen has been
    // rendered, so `content-visibility` hides nothing from this one. Only until
    // the photo has settled, after which nothing here cares.
    useEffect(() => {
        const el = ref.current
        if (!el || !pending) return
        const obs = new IntersectionObserver(
            ([entry]) => setOnScreen(entry.intersectionRatio >= IMAGE_ON_SCREEN_RATIO),
            { threshold: IMAGE_ON_SCREEN_RATIO }
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [pending])

    return (
        <div ref={ref} className={styles.mediaItem}>
            {pending && <div className={styles.mediaSkeleton} />}
            {inView && (
                <img
                    src={src}
                    alt={alt}
                    className={`${styles.mediaImg} ${loaded ? styles.mediaImgLoaded : ""}`}
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    decoding="async"
                />
            )}
            <MediaLoading active={onScreen && pending} />
        </div>
    )
}

// ── Video item ────────────────────────────────────────────────
function LazyVideo({
    id,
    src,
    hlsSrc,
    thumbnail,
    duration,
    current,
}: {
    id: string
    src: string
    hlsSrc?: string
    thumbnail?: string
    duration?: number | null
    /** This slide is the one showing in its carousel. */
    current: boolean
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const { tier, preload, attached, near, blocked, wantsPlay, onScreen } = useAutoplayVideo(videoRef, {
        id,
        enabled: current,
        hasPoster: Boolean(thumbnail),
    })

    const [playing, setPlaying] = useState(false)
    const [everPlayed, setEverPlayed] = useState(false)
    // A frame has been painted while playing. Until then the thumbnail is the
    // tile. `canplay` used to drive this swap, but on iOS Safari it can fire
    // before the first frame is composited, which is a flash of black.
    const [frameShown, setFrameShown] = useState(false)
    const [thumbLoaded, setThumbLoaded] = useState(false)
    const [thumbFailed, setThumbFailed] = useState(false)
    // Latched: the thumbnail is fetched once, on approach, and then just stays.
    const [approached, setApproached] = useState(false)
    if (near && !approached) setApproached(true)
    // Given back: there is no frame any more, and the thumbnail is the tile again.
    if (!attached && frameShown) setFrameShown(false)
    // Latched too: the hook stays on the plain mp4 until this video is first
    // wanted, so nothing further away attaches the adaptive ladder.
    const [wanted, setWanted] = useState(false)
    if (tier !== "cold" && tier !== "released" && !wanted) setWanted(true)

    // Sound is GLOBAL (src/store/sound.store.ts) — unmute one video and every
    // video in the app plays with sound until the user mutes again. The hook
    // still pushes the state onto the element as a PROPERTY, which is what the
    // autoplay policy reads.
    const { muted, toggleMuted, applyMuted, mutedRef } = useVideoSound(videoRef)

    // Owns video.src (hence no src attribute below) — hls.js attaches through
    // MediaSource, which a React-controlled src would fight every render.
    useAdaptiveVideo(videoRef, {
        hlsSrc,
        mp4Src: firstFrameSrc(src, Boolean(thumbnail)),
        enabled: wanted,
        attached,
        maxBufferLength: FEED_MAX_BUFFER_SECONDS,
    })

    // After useAdaptiveVideo, so the source is on before anything asks for it.
    // The browser reads `preload` when it starts on a resource, so a warm tile
    // has to start: the winner does not, because its play() already has.
    useEffect(() => {
        const el = videoRef.current
        if (!el || !attached || tier === "active" || preload === "none") return
        if (el.readyState === 0 && el.networkState !== NETWORK_LOADING) el.load()
    }, [attached, preload, tier])

    useEffect(() => {
        const el = videoRef.current
        if (!el || !attached || frameShown) return
        return whenFirstFrame(el, () => setFrameShown(true))
    }, [attached, frameShown])

    // Already loaded by the time it is here (it was cached): its load event may
    // have come and gone.
    const onThumbRef = useCallback((img: HTMLImageElement | null) => {
        if (img?.complete && img.naturalWidth > 0) setThumbLoaded(true)
    }, [])

    const toggleMute = useCallback((e: React.MouseEvent) => {
        // The tile wrapper opens the viewer on click — this button must not
        // reach it, which is the whole reason the old badge was unusable.
        e.stopPropagation()
        // Apply to THIS element in the same tick as well as through the store:
        // the tap is the user gesture the autoplay policy is waiting for, and
        // waiting a render for the effect would spend it.
        applyMuted(!mutedRef.current)
        toggleMuted()
    }, [applyMuted, mutedRef, toggleMuted])

    const showDuration = Boolean(duration) && !everPlayed

    const thumbPending = Boolean(thumbnail) && !thumbLoaded && !thumbFailed
    const videoLoading = useVideoLoading(videoRef, { wanted: wantsPlay, hasFrame: frameShown })

    return (
        <div className={`${styles.mediaItem} ${styles.videoItem}`} data-video-tier={tier}>
            {thumbPending && <div className={styles.mediaSkeleton} />}
            {/* Under the video, and it stays: the frame fades in over it. */}
            {thumbnail && approached && (
                <img
                    ref={onThumbRef}
                    src={thumbnail}
                    alt=""
                    className={`${styles.mediaImg} ${thumbLoaded ? styles.mediaImgLoaded : ""}`}
                    onLoad={() => setThumbLoaded(true)}
                    onError={() => setThumbFailed(true)}
                    decoding="async"
                />
            )}
            <video
                ref={videoRef}
                className={styles.videoEl}
                // With no thumbnail there is nothing to fade in over: its own
                // #t=0.1 frame is the picture.
                data-frame-shown={frameShown || !thumbnail ? "" : undefined}
                muted
                playsInline
                loop
                preload={preload}
                onPlay={() => setPlaying(true)}
                onPlaying={() => setEverPlayed(true)}
                onPause={() => setPlaying(false)}
            />
            {/* Blocked: the corner glyph already explains the still picture. */}
            <MediaLoading active={!blocked && (videoLoading || (onScreen && thumbPending))} />
            {(showDuration || blocked) && (
                <span className={styles.videoChip}>
                    {/* Autoplay refused (Low Power Mode, data saver): it still
                        has to read as a video. A tap opens the viewer as ever. */}
                    {blocked && <Icon icon="mdi:video" width={12} height={12} aria-label="Video" />}
                    {showDuration && duration ? fmtDuration(duration) : null}
                </span>
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
// ── Main MediaCarousel ────────────────────────────────────────

interface MediaCarouselProps {
    media: PostMedia[]
    postId: string
    /** A slide was tapped (or the fullscreen button): open the viewer there. */
    onOpenViewer: (slideIndex: number) => void
}

export default function MediaCarousel({
    media,
    postId,
    onOpenViewer,
}: MediaCarouselProps) {
    const [slideIdx, setSlideIdx] = useState(0)

    // Touch swipe
    const touchStartX = useRef<number>(0)
    const trackRef = useRef<HTMLDivElement>(null)

    const isSingle = media.length === 1
    const totalSlides = media.length

    const goTo = useCallback((i: number) => {
        setSlideIdx(Math.max(0, Math.min(i, totalSlides - 1)))
    }, [totalSlides])

    // The full-screen viewer closed on THIS post: show the slide it was on,
    // so the card the list lands on matches what the reader just saw. A
    // subscription rather than a selector-driven effect: only this card
    // reacts, and only to its own key.
    useEffect(
        () =>
            usePostViewerStore.subscribe((state, previous) => {
                const landed = state.landings[postId]
                if (landed && landed !== previous.landings[postId]) goTo(landed.slide)
            }),
        [postId, goTo]
    )

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
                            onClick={() => onOpenViewer(i)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && onOpenViewer(i)}
                            aria-label={`View ${item.media_type} ${i + 1} of ${sorted.length} full screen`}
                        >
                            {item.media_type === "video" ? (
                                <LazyVideo
                                    id={item.id}
                                    src={videoSrc(item)}
                                    hlsSrc={hlsSrc()}
                                    thumbnail={posterSrc(item) || undefined}
                                    duration={item.duration}
                                    current={i === slideIdx}
                                />
                            ) : (
                                <LazyImage
                                    // The 640px copy in the scrolling feed; the
                                    // viewer loads the full object.
                                    src={thumbSrc(item)}
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
                    onClick={(e) => { e.stopPropagation(); onOpenViewer(slideIdx) }}
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
    )
}
