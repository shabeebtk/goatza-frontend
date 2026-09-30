"use client"

/**
 * Thumbnail first, the full object once it has loaded.
 *
 * Lifted out of `MediaLightbox`, which is where it was written and where the
 * only copy lived. It is shared now because the recruitment poster card has
 * the same problem for the opposite reason: the lightbox has a thumb already
 * cached and wants the full file behind it, and the card has a 640px thumb
 * being asked to fill the whole width of a phone.
 *
 * There is deliberately ONE of these. A second implementation is how the two
 * surfaces end up with different swap rules and different bugs.
 */

import { useEffect, useState } from "react"
import { thumbSrc, videoSrc, type MediaLike } from "@/shared/services/mediaDelivery"

/**
 * `enabled` is the data budget, and it is why this takes a flag rather than
 * being unconditional. Swapping every card in a long list downloads BOTH
 * copies of everything, and these lists are read on Indian mobile data — so
 * a list turns it on for the first couple of cards and leaves the rest on the
 * thumb until something actually opens them.
 *
 * Off, this is exactly `thumbSrc` and no second request is ever made. It is
 * also a no-op for a row with no separate thumbnail (`thumbSrc` already fell
 * back to the full file), and for a `blob:` preview, where the two are the
 * same URL.
 */
export function useProgressiveSrc(
    item: MediaLike | null | undefined,
    enabled = true
): string {
    const thumb = thumbSrc(item)

    // The URL that was ACTUALLY loaded, and the thumb it was loaded for.
    // Holding both means a slot handed a different row (a refetch that
    // reordered, a rail that recycled) falls straight back to the new row's
    // thumb instead of showing the previous row's full file until this one
    // finishes — the pairing is the whole reason this is one state object.
    const [loaded, setLoaded] = useState<{ for: string; src: string } | null>(null)

    useEffect(() => {
        if (!enabled) return
        const full = videoSrc(item)
        if (!full || full === thumb) return

        let cancelled = false
        const img = new Image()
        img.onload = () => {
            if (!cancelled) setLoaded({ for: thumb, src: full })
        }
        img.src = full
        return () => {
            cancelled = true
        }
    }, [thumb, item, enabled])

    return loaded?.for === thumb ? loaded.src : thumb
}

export default useProgressiveSrc
