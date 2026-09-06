"use client"

/**
 * MediaLightbox — a RUN of media, fullscreen, on a dark backdrop.
 *
 * The sibling of ImageLightbox, not a replacement for it. ImageLightbox is
 * deliberately single-image and says so in its own header: its two callers each
 * show ONE picture, and paging chrome there would be a control that lies. This
 * is the component for the other case — a recruitment's ordered media, where
 * next/prev and a counter are the whole point.
 *
 * It follows ImageLightbox's API style rather than inventing one: mount it
 * conditionally (`{open && <MediaLightbox … />}`) instead of passing an `open`
 * prop, because the scroll lock, the focus capture and the focus return all
 * hang off mount/unmount, which is what makes them impossible to leak.
 *
 * ImageLightbox itself is untouched: it has two callers in chat and
 * achievements, and widening it into a carousel to serve a third would hand
 * both of them paging they must never show.
 *
 * Not zoom/pan: ImageLightbox has no zoom to preserve, so neither does this.
 * MediaCarousel's own lightbox does, but that one is wired to the posts feed's
 * adaptive-video ladder and custom video chrome — see RecruitmentHeroCarousel
 * for why that was mirrored rather than shared.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import Portal from "../ui/Portal/Portal"
import styles from "./MediaLightbox.module.css"

/**
 * Structurally what `RecruitmentMedia` already is, declared here so this shared
 * component does not import a feature's types. Anything with a URL and a kind
 * can open in it.
 */
export interface MediaLightboxItem {
    id?: string
    media_type: "image" | "video"
    file_url: string
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

/**
 * The fullscreen player.
 *
 * NATIVE `controls`, and unmuted. This is the ONLY playback path for
 * recruitment video — the carousel behind it deliberately never autoplays (see
 * RecruitmentHeroCarousel) — so the user arrived here by explicitly asking for
 * the clip, and the platform's own scrubber is what they expect. Posts'
 * lightbox draws custom chrome instead because it inherits the feed's global
 * mute state; nothing here does.
 */
function LightboxVideo({ item }: { item: MediaLightboxItem }) {
    const ref = useRef<HTMLVideoElement>(null)

    // Closing the viewer, or changing slide, unmounts this — stop the audio
    // rather than trusting the browser to pause a detached element for us.
    // Same reasoning as MediaCarousel's lightbox video.
    useEffect(() => {
        const el = ref.current
        return () => el?.pause()
    }, [])

    return (
        <video
            ref={ref}
            src={item.file_url}
            className={styles.media}
            poster={item.thumbnail_url || undefined}
            controls
            autoPlay
            playsInline
            // Reaching for the seek bar must not dismiss the viewer.
            onClick={(e) => e.stopPropagation()}
        />
    )
}

export default function MediaLightbox({
    media,
    startIndex = 0,
    onClose,
    label = "Media viewer",
}: MediaLightboxProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const touchStartX = useRef(0)
    const [idx, setIdx] = useState(() =>
        Math.max(0, Math.min(startIndex, media.length - 1))
    )

    const total = media.length
    const current = media[idx]

    const go = useCallback(
        (next: number) => setIdx(Math.max(0, Math.min(next, total - 1))),
        [total]
    )

    // Scroll lock + focus, both tied to mount so neither can outlive the
    // overlay. The previous overflow is restored rather than cleared: this can
    // open from inside a modal that locked the body first, and blanking the
    // value there would unlock a page that is still covered. Lifted verbatim
    // from ImageLightbox — the two viewers must behave identically here.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        // Move focus in so Esc and the arrow keys work without a click first.
        dialogRef.current?.focus()

        return () => {
            document.body.style.overflow = prevOverflow
            // Back to the thumbnail that opened this, not to the top of the
            // page — closing a viewer should leave a keyboard user exactly
            // where they were.
            previouslyFocused?.focus?.()
        }
    }, [])

    // ── Back-button / gesture handling ──────────────────────────
    // The app's pattern for this is MediaCarousel's lightbox: reserve ONE
    // history entry so the mobile back button closes the viewer instead of
    // navigating off the recruitment, and route every in-app close through it
    // so the button, Esc, the backdrop and the hardware gesture agree.
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    })
    const pushedRef = useRef(false)

    useEffect(() => {
        // Guarded with a ref so React StrictMode's double-invoked effect (dev)
        // pushes only once — and, crucially, the cleanup never calls
        // history.back(), which on the StrictMode mount→cleanup→mount cycle
        // would pop our entry and close the viewer the instant it opened.
        if (!pushedRef.current) {
            window.history.pushState({ goatzaMediaLightbox: true }, "")
            pushedRef.current = true
        }
        const onPop = () => onCloseRef.current()
        window.addEventListener("popstate", onPop)
        return () => window.removeEventListener("popstate", onPop)
    }, [])

    const requestClose = useCallback(() => {
        if (
            typeof window !== "undefined" &&
            window.history.state?.goatzaMediaLightbox
        ) {
            window.history.back() // → popstate → onClose
        } else {
            onCloseRef.current()
        }
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                requestClose()
                return
            }
            // Skipped while a native control has focus so the browser's own
            // arrow handling on the seek bar is not doubled up.
            if ((e.target as HTMLElement | null)?.tagName === "VIDEO") return
            if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, total - 1))
            if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0))
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [requestClose, total])

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
                // The backdrop closes on click and the media sits inside it —
                // tapping the photo to dismiss is what every phone gallery
                // does. The <video> below stops propagation for itself, since
                // reaching for its controls must not close the viewer.
                onClick={requestClose}
                onTouchStart={(e) => {
                    touchStartX.current = e.touches[0].clientX
                }}
                onTouchEnd={(e) => {
                    const diff =
                        touchStartX.current - e.changedTouches[0].clientX
                    if (Math.abs(diff) > SWIPE_THRESHOLD_PX)
                        go(idx + (diff > 0 ? 1 : -1))
                }}
            >
                <button
                    className={styles.close}
                    type="button"
                    aria-label="Close"
                    onClick={(e) => {
                        // Without this the backdrop handler fires too and the
                        // viewer closes twice — harmless only because every
                        // close path here is idempotent.
                        e.stopPropagation()
                        requestClose()
                    }}
                >
                    <Icon icon="mdi:close" width={24} height={24} />
                </button>

                {total > 1 && (
                    <div className={styles.counter}>
                        {idx + 1} / {total}
                    </div>
                )}

                {current.media_type === "video" ? (
                    /* key: changing slide gets a FRESH element, so the outgoing
                       one unmounts — which is what runs its pause. */
                    <LightboxVideo
                        key={current.id ?? current.file_url}
                        item={current}
                    />
                ) : (
                    /* Plain <img>: the src is on the media domain, and
                       next/image would need it in remotePatterns for no gain on
                       a full-bleed image that is already the right size. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={current.file_url}
                        alt=""
                        className={styles.media}
                    />
                )}

                {total > 1 && idx > 0 && (
                    <button
                        className={`${styles.nav} ${styles.navPrev}`}
                        type="button"
                        aria-label="Previous"
                        onClick={(e) => {
                            e.stopPropagation()
                            go(idx - 1)
                        }}
                    >
                        <Icon icon="mdi:chevron-left" width={28} height={28} />
                    </button>
                )}
                {total > 1 && idx < total - 1 && (
                    <button
                        className={`${styles.nav} ${styles.navNext}`}
                        type="button"
                        aria-label="Next"
                        onClick={(e) => {
                            e.stopPropagation()
                            go(idx + 1)
                        }}
                    >
                        <Icon icon="mdi:chevron-right" width={28} height={28} />
                    </button>
                )}
            </div>
        </Portal>
    )
}
