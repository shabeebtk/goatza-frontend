"use client"

/**
 * HeroThumbs — the desktop thumbnail strip under the poster.
 *
 * A sibling of RecruitmentHeroCarousel rather than a part of it: the desktop
 * layout puts the poster and this strip in different cells of its grid, so the
 * page composes them. State is lifted — this component selects, the carousel
 * displays, and the page owns the index that joins them.
 *
 * Hidden entirely at one item. A single thumb under a single-media hero is a
 * control with nothing to choose.
 */

import { Icon } from "@iconify/react"

import { posterSrc } from "@/shared/services/mediaDelivery"
import type { RecruitmentMedia } from "../../services/recruitments.api"
import { formatDuration } from "./formatDuration"
import styles from "./HeroThumbs.module.css"

interface HeroThumbsProps {
    /** Ordered media — the same array the carousel was handed. */
    media: RecruitmentMedia[]
    /** Which thumb reads as active. */
    index: number
    /** Selecting a thumb drives the carousel. */
    onSelect: (index: number) => void
    /**
     * Fired when the ALREADY-active thumb is clicked, which is the "show me
     * this one properly" gesture. Optional: without it the strip only ever
     * selects, and the page's own viewer stays the slide's job.
     */
    onActivate?: (index: number) => void
    className?: string
}

export default function HeroThumbs({
    media,
    index,
    onSelect,
    onActivate,
    className,
}: HeroThumbsProps) {
    if (media.length <= 1) return null

    return (
        <div className={`${styles.thumbs} ${className ?? ""}`}>
            {media.map((item, i) => {
                const isVideo = item.media_type === "video"
                // Images use their own 640px thumbnail when one exists; a video
                // uses its poster frame. `posterSrc` already encodes that
                // fallback order, so the two cases read the same field set.
                const still = isVideo
                    ? posterSrc(item)
                    : item.thumbnail_url || item.file_url
                const duration = isVideo ? formatDuration(item.duration) : null
                const active = i === index

                return (
                    <button
                        key={item.id}
                        type="button"
                        className={`${styles.thumb} ${active ? styles.thumbActive : ""}`}
                        aria-label={`${isVideo ? "Video" : "Photo"} ${i + 1} of ${media.length}`}
                        aria-current={active}
                        onClick={() => {
                            if (active) onActivate?.(i)
                            else onSelect(i)
                        }}
                    >
                        {still && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={still}
                                alt=""
                                className={styles.thumbImg}
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                            />
                        )}
                        {isVideo && (
                            <>
                                <span className={styles.thumbPlay} aria-hidden="true">
                                    <Icon icon="mdi:play" width={15} height={15} />
                                </span>
                                {duration && (
                                    <span className={styles.thumbDuration}>{duration}</span>
                                )}
                            </>
                        )}
                    </button>
                )
            })}
        </div>
    )
}
