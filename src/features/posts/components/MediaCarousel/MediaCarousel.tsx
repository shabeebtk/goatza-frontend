"use client"

/**
 * MediaCarousel
 *
 * Single media  → natural size (object-contain), max height 480px
 * Multiple      → fixed height 340px, object-cover, swipeable carousel
 * Fullscreen    → portal lightbox with zoom/pan
 * Video         → autoplay only when visible (IntersectionObserver), muted
 */

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import styles from "./MediaCarousel.module.css"

// ── Helpers ───────────────────────────────────────────────────

function fmtDuration(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Lazy media item ───────────────────────────────────────────

function LazyImage({
    src,
    alt,
    isSingle,
    className,
}: {
    src: string
    alt: string
    isSingle: boolean
    className: string
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
        <div ref={ref} className={`${styles.mediaItem} ${className}`}>
            {!loaded && <div className={styles.mediaSkeleton} />}
            {inView && (
                <img
                    src={src}
                    alt={alt}
                    className={`${styles.mediaImg} ${isSingle ? styles.mediaImgContain : styles.mediaImgCover} ${loaded ? styles.mediaImgLoaded : ""}`}
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
    thumbnail,
    duration,
}: {
    src: string
    thumbnail?: string
    duration?: number | null
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [playing, setPlaying] = useState(false)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        const el = videoRef.current
        if (!el) return

        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.intersectionRatio >= 0.5) {
                    el.play().catch(() => { })
                    setPlaying(true)
                } else {
                    el.pause()
                    setPlaying(false)
                }
            },
            { threshold: 0.5 }
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    return (
        <div className={`${styles.mediaItem} ${styles.videoItem}`}>
            {!loaded && thumbnail && (
                <img src={thumbnail} alt="Video thumbnail" className={`${styles.mediaImg} ${styles.mediaImgCover}`} />
            )}
            <video
                ref={videoRef}
                src={src}
                className={`${styles.mediaImg} ${styles.mediaImgCover} ${loaded ? styles.mediaImgLoaded : ""}`}
                muted
                playsInline
                loop
                preload="none"
                controls={false}
                poster={thumbnail}
                onLoadedData={() => setLoaded(true)}
            />
            {!playing && (
                <div className={styles.videoPlayOverlay}>
                    <span className={styles.videoPlayBtn}>
                        <Icon icon="mdi:play" width={28} height={28} />
                    </span>
                    {duration && (
                        <span className={styles.videoDuration}>{fmtDuration(duration)}</span>
                    )}
                </div>
            )}
            {playing && (
                <div className={styles.videoMutedBadge}>
                    <Icon icon="mdi:volume-off" width={12} height={12} />
                </div>
            )}
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
    const current = media[idx]

    useEffect(() => setMounted(true), [])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
            if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, media.length - 1))
            if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0))
        }
        document.addEventListener("keydown", handler)
        return () => document.removeEventListener("keydown", handler)
    }, [media.length, onClose])

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = "" }
    }, [])

    if (!mounted) return null

    return createPortal(
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Media viewer">
            {/* Backdrop */}
            <div className={styles.lightboxBg} onClick={onClose} />

            {/* Close */}
            <button className={styles.lightboxClose} onClick={onClose} type="button" aria-label="Close">
                <Icon icon="mdi:close" width={24} height={24} />
            </button>

            {/* Counter */}
            {media.length > 1 && (
                <div className={styles.lightboxCounter}>
                    {idx + 1} / {media.length}
                </div>
            )}

            {/* Media */}
            <div className={styles.lightboxMedia}>
                {current.media_type === "video" ? (
                    <video
                        src={current.file_url}
                        controls
                        autoPlay
                        playsInline
                        className={styles.lightboxImg}
                        poster={current.thumbnail_url || undefined}
                    />
                ) : (
                    <img
                        src={current.file_url}
                        alt=""
                        className={styles.lightboxImg}
                    />
                )}
            </div>

            {/* Prev / Next */}
            {idx > 0 && (
                <button
                    className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
                    onClick={() => setIdx((i) => i - 1)}
                    type="button"
                    aria-label="Previous"
                >
                    <Icon icon="mdi:chevron-left" width={28} height={28} />
                </button>
            )}
            {idx < media.length - 1 && (
                <button
                    className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
                    onClick={() => setIdx((i) => i + 1)}
                    type="button"
                    aria-label="Next"
                >
                    <Icon icon="mdi:chevron-right" width={28} height={28} />
                </button>
            )}

            {/* Dot indicators */}
            {media.length > 1 && (
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

    return (
        <>
            <div className={`${styles.carousel} ${isSingle ? styles.carouselSingle : styles.carouselMulti}`}>

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
                                    src={item.file_url}
                                    thumbnail={item.thumbnail_url || undefined}
                                    duration={item.duration}
                                />
                            ) : (
                                <LazyImage
                                    src={item.file_url}
                                    alt={`Media ${i + 1}`}
                                    isSingle={isSingle}
                                    className=""
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