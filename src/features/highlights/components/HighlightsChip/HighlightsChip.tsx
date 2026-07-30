"use client"

/**
 * "▶ Highlights (n)" — the recruiter's entry point into a player's reel
 * (HIGHLIGHTS_SPEC.md §3).
 *
 * The count arrives WITH the list it sits in (one batched query server-side), so
 * the chip adds no request and no layout shift to the applicant/player list. A
 * null count means the endpoint didn't supply one — the chip stays hidden rather
 * than guessing 0 or firing a request per card.
 *
 * Hover (desktop) and press-start (mobile) prefetch the reel, so by the time the
 * tap registers the clips are usually already in cache.
 */

import { Icon } from "@iconify/react"

import { useHighlightsPrefetch } from "../../hooks/useHighlightsPrefetch"
import styles from "./HighlightsChip.module.css"

type HighlightsChipProps = {
    username: string
    count?: number | null
    onOpen: () => void
    className?: string
}

export default function HighlightsChip({
    username,
    count,
    onOpen,
    className,
}: HighlightsChipProps) {
    const { prefetchHighlights } = useHighlightsPrefetch()

    if (!count || count <= 0) return null

    const warm = () => prefetchHighlights(username, { withFirstThumbnail: true })

    return (
        <button
            type="button"
            className={`${styles.chip} ${className ?? ""}`}
            onMouseEnter={warm}
            onFocus={warm}
            onPointerDown={warm}
            onClick={(e) => {
                // Cards are often wrapped in a link/row button — this must not
                // navigate the recruiter away from the list.
                e.preventDefault()
                e.stopPropagation()
                onOpen()
            }}
            aria-label={`Watch ${count} highlight${count === 1 ? "" : "s"}`}
        >
            <Icon icon="mdi:play-circle-outline" width={14} height={14} />
            Highlights
            <span className={styles.count}>{count}</span>
        </button>
    )
}
