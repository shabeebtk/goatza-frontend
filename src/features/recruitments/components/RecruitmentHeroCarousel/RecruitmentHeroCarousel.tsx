"use client"

/**
 * RecruitmentHeroCarousel — the recruitment's media, as the poster stage.
 *
 * MIRRORED from posts' MediaCarousel rather than sharing it, decided after
 * reading it. The swipe maths, the counter and the slide track here are
 * deliberately the same shapes; what could not come along is everything the
 * posts carousel is actually made of:
 *
 *   - it is typed on `PostMedia` and sizes itself with `getPostAspectRatio`,
 *     which clamps to the FEED's ratio range — this stage is a fixed 4:5 poster
 *   - its videos autoplay on an IntersectionObserver through the global sound
 *     store and the adaptive HLS ladder (`useAdaptiveVideo`); v1 here plays
 *     nothing inline at all (see below)
 *   - its lightbox draws custom video chrome; this one wants native controls
 *
 * Lifting it would have meant gutting three of its four moving parts, leaving
 * the feed with a thinner component to serve a surface that does not want any
 * of it. What IS shared is the genuinely common machinery underneath:
 * `mediaDelivery` for URL fallbacks and `MediaLightbox` for fullscreen.
 *
 * Playback: in-carousel videos DELIBERATELY do not autoplay in v1. The still +
 * ▶ is an invitation, and tap-to-fullscreen is the only playback path — a
 * poster that starts moving under the title scrim fights the thing it is
 * introducing, and the feed already owns the autoplay behaviour.
 */

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Icon } from "@iconify/react"

import MediaLightbox from "@/shared/components/ImageLightbox/MediaLightbox"
import { posterSrc } from "@/shared/services/mediaDelivery"
import type { RecruitmentMedia } from "../../services/recruitments.api"
import { formatDuration } from "./formatDuration"
import styles from "./RecruitmentHeroCarousel.module.css"

/** A drag shorter than this is a tap, not a swipe. Matches MediaCarousel. */
const SWIPE_THRESHOLD_PX = 40

interface RecruitmentHeroCarouselProps {
    /** Ordered media. The API already returns them sorted by `order`. */
    media: RecruitmentMedia[]
    /**
     * Content-agnostic overlay slot, drawn above the stage and below the
     * chrome. Deliberately a bare ReactNode: the title scrim that goes in it is
     * a later concern, and this component must not learn what a title is.
     * `pointer-events: none` by default so a scrim cannot eat the tap that
     * opens fullscreen — an interactive overlay re-enables it on its own nodes.
     */
    overlay?: ReactNode
    /** Size/aspect override, so a desktop layout can reshape the poster. */
    className?: string
    /**
     * Controlled index. Omit for a self-contained carousel; pass both this and
     * `onIndexChange` to drive it from outside — which is how HeroThumbs
     * selects a slide.
     */
    index?: number
    onIndexChange?: (index: number) => void
    /**
     * Tap handler override. Absent, the carousel opens its OWN MediaLightbox on
     * a slide tap and is fully self-contained. Provided, it opens nothing and
     * hands the index up instead — which is what a page showing thumbs does, so
     * that slide taps and thumb taps share ONE viewer rather than racing two.
     */
    onSlideActivate?: (index: number) => void
}

export default function RecruitmentHeroCarousel({
    media,
    overlay,
    className,
    index,
    onIndexChange,
    onSlideActivate,
}: RecruitmentHeroCarouselProps) {
    const [uncontrolledIdx, setUncontrolledIdx] = useState(0)
    const [viewerIdx, setViewerIdx] = useState<number | null>(null)
    const touchStartX = useRef(0)

    const total = media.length
    // Single media is not "a carousel of one": segments, counter and swipe
    // chrome must not render AT ALL, so the stage is indistinguishable from a
    // plain image hero. Chrome that describes a run of one is chrome that lies.
    const isSingle = total <= 1

    const controlled = index != null
    const idx = Math.max(0, Math.min(controlled ? index : uncontrolledIdx, total - 1))

    const goTo = useCallback(
        (next: number) => {
            const clamped = Math.max(0, Math.min(next, total - 1))
            if (!controlled) setUncontrolledIdx(clamped)
            onIndexChange?.(clamped)
        },
        [controlled, onIndexChange, total]
    )

    const activate = useCallback(
        (i: number) => {
            if (onSlideActivate) onSlideActivate(i)
            else setViewerIdx(i)
        },
        [onSlideActivate]
    )

    const onKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                activate(idx)
                return
            }
            if (isSingle) return
            if (e.key === "ArrowRight") {
                e.preventDefault()
                goTo(idx + 1)
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault()
                goTo(idx - 1)
            }
        },
        [activate, goTo, idx, isSingle]
    )

    if (total === 0) return null

    return (
        <>
            <div className={`${styles.stage} ${className ?? ""}`}>
                {/* The tap target wraps ONLY the media. The chrome below are its
                    siblings, not its children: segments and click zones are
                    themselves buttons, and a button inside a button is a control
                    a screen reader cannot describe and a keyboard cannot reach. */}
                <div
                    className={styles.tap}
                    role="button"
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    aria-label={
                        isSingle
                            ? "View media full screen"
                            : `Media ${idx + 1} of ${total}. View full screen`
                    }
                    onTouchStart={(e) => {
                        touchStartX.current = e.touches[0].clientX
                    }}
                    onTouchEnd={(e) => {
                        const diff = touchStartX.current - e.changedTouches[0].clientX
                        // Below the threshold this was a tap, not a swipe — and
                        // on touch the click event that follows opens the viewer,
                        // so nothing is done here.
                        if (!isSingle && Math.abs(diff) > SWIPE_THRESHOLD_PX) {
                            goTo(idx + (diff > 0 ? 1 : -1))
                        }
                    }}
                    onClick={() => activate(idx)}
                >
                    <div
                        className={styles.track}
                        style={{ transform: `translateX(-${idx * 100}%)` }}
                    >
                        {media.map((item, i) => (
                            <HeroSlide key={item.id} item={item} index={i} />
                        ))}
                    </div>
                </div>

                {/* Overlay slot — above the stage, below the chrome, so a scrim
                    never covers the counter or the segments. */}
                {overlay && <div className={styles.overlay}>{overlay}</div>}

                {!isSingle && (
                    <>
                        {/* Segmented progress — one per item. `done` fills, the
                            current one is half-lit, the rest are the track. */}
                        <div
                            className={styles.segments}
                            role="tablist"
                            aria-label="Media"
                        >
                            {media.map((item, i) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={i === idx}
                                    aria-label={`Media ${i + 1}`}
                                    className={`${styles.segment} ${
                                        i < idx ? styles.segmentDone : ""
                                    } ${i === idx ? styles.segmentCurrent : ""}`}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        goTo(i)
                                    }}
                                />
                            ))}
                        </div>

                        <div className={styles.counter}>
                            {idx + 1} / {total}
                        </div>

                        {/* Click zones: the desktop paging affordance. Left and
                            right thirds of the stage, so a pointer user pages
                            without hunting for a control, while the middle
                            still opens fullscreen. Hidden from touch, which
                            has the swipe, and from a11y — the segments above
                            are the labelled controls. */}
                        {idx > 0 && (
                            <button
                                type="button"
                                aria-hidden="true"
                                tabIndex={-1}
                                className={`${styles.zone} ${styles.zonePrev}`}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    goTo(idx - 1)
                                }}
                            >
                                <span className={styles.zoneIcon}>
                                    <Icon icon="mdi:chevron-left" width={22} height={22} />
                                </span>
                            </button>
                        )}
                        {idx < total - 1 && (
                            <button
                                type="button"
                                aria-hidden="true"
                                tabIndex={-1}
                                className={`${styles.zone} ${styles.zoneNext}`}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    goTo(idx + 1)
                                }}
                            >
                                <span className={styles.zoneIcon}>
                                    <Icon icon="mdi:chevron-right" width={22} height={22} />
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>

            {viewerIdx !== null && (
                <MediaLightbox
                    media={media}
                    startIndex={viewerIdx}
                    label="Recruitment media viewer"
                    onClose={() => setViewerIdx(null)}
                />
            )}
        </>
    )
}

// ── Slide ─────────────────────────────────────────────────────

/**
 * One item on the stage.
 *
 * Images and video stills are both `object-fit: cover` inside the 4:5 frame,
 * which is the whole backward-compatibility story: a landscape photo uploaded
 * before this frame existed is centre-cropped into it, never stretched and
 * never allowed to set its own height. Nothing is migrated.
 */
function HeroSlide({ item, index }: { item: RecruitmentMedia; index: number }) {
    const [loaded, setLoaded] = useState(false)
    const isVideo = item.media_type === "video"
    // A video's still is its poster frame; falling back to `file_url` for one
    // would hand an <img> a video file. Empty → the brand treatment below shows
    // through on its own, which is what the mockup draws for an unposted clip.
    const still = isVideo ? posterSrc(item) : item.file_url
    const duration = isVideo ? formatDuration(item.duration) : null

    return (
        <div className={styles.slide}>
            {still ? (
                <>
                    {!loaded && <div className={styles.skeleton} />}
                    {/* Plain <img>: the src is on the media domain, and
                        next/image would need it in remotePatterns for no gain
                        on a full-bleed image that is already the right size. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={still}
                        alt={`Media ${index + 1}`}
                        className={`${styles.asset} ${loaded ? styles.assetLoaded : ""}`}
                        onLoad={() => setLoaded(true)}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                    />
                </>
            ) : null}

            {isVideo && (
                <>
                    <span className={styles.play} aria-hidden="true">
                        <Icon icon="mdi:play" width={26} height={26} />
                    </span>
                    {duration && (
                        <span className={styles.duration}>{duration}</span>
                    )}
                </>
            )}
        </div>
    )
}
