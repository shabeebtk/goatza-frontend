"use client"

/**
 * ImageLightbox — one image, fullscreen, on a dark backdrop.
 *
 * Lifted out of ImageMessage, which had grown the only copy of this in the
 * app. Achievements needed the same thing, and a second copy is exactly how
 * the two drift: one of them gets a focus fix, the other keeps the old
 * behaviour, and a keyboard user meets two different viewers in one session.
 *
 * Deliberately single-image: there is no next/prev and no counter. The two
 * callers each show ONE picture, and a carousel with nothing to page through
 * is a control that lies about what it does. HighlightViewer is the component
 * for a reel — this is not a smaller version of it.
 *
 * Mount it conditionally (`{open && <ImageLightbox … />}`) rather than passing
 * an `open` prop: the scroll lock, the focus capture and the focus return all
 * hang off mount/unmount, which is what makes them impossible to leak.
 */

import { useEffect, useRef } from "react"
import { Icon } from "@iconify/react"

import Portal from "../ui/Portal/Portal"
import styles from "./ImageLightbox.module.css"

interface ImageLightboxProps {
    /** Full-resolution source. The caller passes the original, not a thumb. */
    src: string
    /**
     * Alt text for the image. "" is a legitimate value — in a chat bubble the
     * photo IS the message and there is nothing to describe it with, so the
     * dialog's own label carries the meaning instead.
     */
    alt: string
    onClose: () => void
}

export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
    const dialogRef = useRef<HTMLDivElement>(null)

    // Scroll lock + focus, both tied to mount so neither can outlive the
    // overlay. The previous overflow is restored rather than cleared: this can
    // open from inside a modal that locked the body first, and blanking the
    // value there would unlock a page that is still covered.
    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        // Move focus in so Esc works without a click first.
        dialogRef.current?.focus()

        return () => {
            document.body.style.overflow = prevOverflow
            // Back to the thumbnail that opened this, not to the top of the
            // page — closing a viewer should leave a keyboard user exactly
            // where they were.
            previouslyFocused?.focus?.()
        }
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [onClose])

    return (
        <Portal>
            {/* The backdrop closes on click, and the image sits inside it
                without stopping propagation — tapping the photo to dismiss is
                what every phone gallery does, and the close button is there
                for anyone who expects the other thing. */}
            <div
                ref={dialogRef}
                className={styles.viewer}
                role="dialog"
                aria-modal="true"
                aria-label="Photo viewer"
                tabIndex={-1}
                onClick={onClose}
            >
                <button
                    className={styles.viewerClose}
                    type="button"
                    aria-label="Close"
                    onClick={(e) => {
                        // Without this the backdrop handler fires too and
                        // onClose runs twice — harmless today, but only
                        // because every caller's close is idempotent.
                        e.stopPropagation()
                        onClose()
                    }}
                >
                    <Icon icon="mdi:close" width={24} height={24} />
                </button>
                {/* Plain <img>: the src is on the media domain,
                    and next/image would need it in remotePatterns for no gain
                    on a full-bleed image that is already the right size. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={alt} className={styles.viewerImg} />
            </div>
        </Portal>
    )
}
