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
    const [videoReady, setVideoReady] = useState(false)

    useEffect(() => {
        const el = videoRef.current
        if (!el) return

        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.intersectionRatio >= 0.5) {
                    // Trigger load if not already loading
                    if (el.readyState === 0) {
                        el.load()
                    }
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
            {/* Thumbnail shown only until video has rendered its first frame */}
            {!videoReady && thumbnail && (
                <img
                    src={thumbnail}
                    alt="Video thumbnail"
                    className={`${styles.mediaImg} ${styles.mediaImgCover}`}
                    style={{ position: "absolute", inset: 0, zIndex: 1 }}
                />
            )}
            <video
                ref={videoRef}
                src={src}
                className={`${styles.mediaImg} ${styles.mediaImgCover}`}
                style={{ opacity: videoReady ? 1 : 0, transition: "opacity 0.2s" }}
                muted
                playsInline
                loop
                preload="metadata"  // ← metadata not none, so browser knows dimensions + can start
                poster={thumbnail}
                onCanPlay={() => setVideoReady(true)}  // ← fires earlier than onLoadedData
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
  
  // ── Zoom state ──────────────────────────────────────────────
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const lastTap = useRef(0)
  const lastPinchDist = useRef<number | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const current = media[idx]
  const isZoomed = scale > 1
  const isImage = current.media_type === "image"

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
      if (e.key === "Escape") { if (isZoomed) resetZoom(); else onClose() }
      if (e.key === "ArrowRight" && !isZoomed) setIdx((i) => Math.min(i + 1, media.length - 1))
      if (e.key === "ArrowLeft"  && !isZoomed) setIdx((i) => Math.max(i - 1, 0))
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.5, 4))
      if (e.key === "-") setScale((s) => { const ns = Math.max(s - 0.5, 1); if (ns === 1) setOffset({ x: 0, y: 0 }); return ns })
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [media.length, onClose, isZoomed, resetZoom])

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
        onClick={() => { if (!isZoomed) onClose() }}
      />

      {/* Close */}
      <button className={styles.lightboxClose} onClick={onClose} type="button" aria-label="Close">
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