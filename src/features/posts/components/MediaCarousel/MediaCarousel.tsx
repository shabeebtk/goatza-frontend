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
 * Video        → same clamped container + cover; autoplays only when visible
 *                (IntersectionObserver), muted; the viewer shows it with contain.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import { getPostAspectRatio } from "@/features/posts/utils/media"
import { useAdaptiveVideo } from "@/shared/hooks/useAdaptiveVideo"
import { useVideoSound } from "@/shared/hooks/useVideoSound"
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
    suspended = false,
}: {
    src: string
    hlsSrc?: string
    thumbnail?: string
    duration?: number | null
    /** The viewer is open over this card: stay paused even while visible. */
    suspended?: boolean
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [playing, setPlaying] = useState(false)
    // What the observer last decided, so lifting `suspended` can resume
    // without waiting for the next intersection change.
    const inViewRef = useRef(false)
    const suspendedRef = useRef(suspended)
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
        // The tile wrapper opens the viewer on click — this button must not
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
                inViewRef.current = entry.intersectionRatio >= 0.5
                if (inViewRef.current) {
                    // First time on screen: let the hook upgrade this element to
                    // the adaptive ladder. State updates from here are batched,
                    // so play() below still runs first and the hook can see that
                    // playback was wanted across the source swap.
                    setActivated(true)
                    // The full-screen viewer is playing its own copy on top —
                    // one video at a time. Resumed by the effect below.
                    if (suspendedRef.current) return
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

    // Viewer open → pause the copy underneath; viewer closed → pick up again
    // if the card is still on screen. Muted playback is always allowed, and
    // the element is already muted-by-property from the first play above.
    // `playing` follows through the element's own play/pause events.
    useEffect(() => {
        suspendedRef.current = suspended
        const el = videoRef.current
        if (!el) return
        if (suspended) el.pause()
        else if (inViewRef.current) el.play().catch(() => { })
    }, [suspended])

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
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
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
// ── Main MediaCarousel ────────────────────────────────────────

interface MediaCarouselProps {
    media: PostMedia[]
    postId: string
    /** A slide was tapped (or the fullscreen button): open the viewer there. */
    onOpenViewer: (slideIndex: number) => void
    /** The viewer is open over this card — its video stays paused meanwhile. */
    viewerOpen?: boolean
}

export default function MediaCarousel({
    media,
    postId,
    onOpenViewer,
    viewerOpen = false,
}: MediaCarouselProps) {
    const [slideIdx, setSlideIdx] = useState(0)

    // Touch swipe
    const touchStartX = useRef<number>(0)
    const trackRef = useRef<HTMLDivElement>(null)

    const isSingle = media.length === 1
    const totalSlides = media.length
    // Any viewer on screen — the list's or a card's own — pauses the copy
    // playing inline underneath it.
    const anyViewerOpen = usePostViewerStore((s) => s.open)

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
                                    src={videoSrc(item)}
                                    hlsSrc={hlsSrc()}
                                    thumbnail={posterSrc(item) || undefined}
                                    duration={item.duration}
                                    suspended={viewerOpen || anyViewerOpen}
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
