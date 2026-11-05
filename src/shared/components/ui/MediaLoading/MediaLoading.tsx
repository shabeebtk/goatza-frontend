"use client"

/**
 * MediaLoading — "the media is coming", on top of a thumbnail or a skeleton.
 *
 * A still picture looks stuck, so a slow video or photo gets a spinner. A fast
 * one must not: nothing shows until `active` has been true for 400 ms, which is
 * what stops it flashing on every load that was going to be fine anyway.
 *
 * White on a soft dark disc, so it reads on a light thumbnail and a dark one, in
 * both themes. It sits over the media and under the tile's own controls, takes
 * no taps, and says nothing to a screen reader.
 */

import { useEffect, useState } from "react"

import styles from "./MediaLoading.module.css"

/** Longer than this and a wait is worth mentioning. */
export const MEDIA_LOADING_DELAY_MS = 400

/** Matches the fade in the stylesheet. */
const FADE_MS = 150

/** True once `active` has held for `delayMs`; false the moment it stops. */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
    const [elapsed, setElapsed] = useState(false)
    if (!active && elapsed) setElapsed(false)

    useEffect(() => {
        if (!active) return
        const timer = setTimeout(() => setElapsed(true), delayMs)
        return () => clearTimeout(timer)
    }, [active, delayMs])

    return active && elapsed
}

export default function MediaLoading({
    active,
    size = "md",
}: {
    active: boolean
    size?: "md" | "sm"
}) {
    const shown = useDelayedFlag(active, MEDIA_LOADING_DELAY_MS)

    // Stays in the tree through its fade out. Latched during render, as the feed
    // tile latches `approached`: the fade in starts with this commit.
    const [mounted, setMounted] = useState(false)
    if (shown && !mounted) setMounted(true)

    useEffect(() => {
        if (shown || !mounted) return
        const timer = setTimeout(() => setMounted(false), FADE_MS)
        return () => clearTimeout(timer)
    }, [shown, mounted])

    if (!mounted) return null

    return (
        <span
            className={[styles.disc, styles[size], shown ? "" : styles.leaving].join(" ")}
            aria-hidden="true"
            data-media-loading={size}
            data-media-loading-leaving={shown ? undefined : ""}
        >
            <span className={styles.ring} />
        </span>
    )
}
