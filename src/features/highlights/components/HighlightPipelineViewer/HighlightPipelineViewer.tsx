"use client"

/**
 * HighlightPipelineViewer — reel review across MANY players without leaving the
 * list (HIGHLIGHTS_SPEC.md §3, "the priority UX").
 *
 * Swiping past a player's last clip rolls onto the next player's first clip,
 * behind a brief interstitial naming who is next. While a reel plays, the NEXT
 * player's list and first poster are prefetched, so the hand-off shows frames
 * rather than a spinner.
 *
 * Callers pass only players known to have visible clips (the chip's count), so
 * there is no reactive "skip the empties" dance here. If a count turns out stale,
 * that player gets an explicit "no clips" card with a Next button rather than the
 * viewer silently jumping.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useHighlights } from "../../hooks/useHighlights"
import { useHighlightsPrefetch } from "../../hooks/useHighlightsPrefetch"
import HighlightViewer from "../HighlightViewer/HighlightViewer"
import styles from "./HighlightPipelineViewer.module.css"

export type PipelinePlayer = {
    username: string
    name?: string
    headline?: string
    avatar?: string
    position?: string | null
    sport?: string | null
    /** Recruitment application this player belongs to, when in a pipeline. */
    applicationId?: string
}

type HighlightPipelineViewerProps = {
    players: PipelinePlayer[]
    startIndex?: number
    onClose: () => void
    /** Quick actions for the current player, rendered in the viewer header. */
    renderActions?: (player: PipelinePlayer) => React.ReactNode
}

/** How long the "next up" card sits over the video. */
const INTERSTITIAL_MS = 750

export default function HighlightPipelineViewer({
    players,
    startIndex = 0,
    onClose,
    renderActions,
}: HighlightPipelineViewerProps) {
    const [index, setIndex] = useState(() =>
        Math.min(Math.max(startIndex, 0), Math.max(players.length - 1, 0))
    )
    const [showInterstitial, setShowInterstitial] = useState(false)

    const timerRef = useRef<number | null>(null)
    const { prefetchHighlights } = useHighlightsPrefetch()

    const safeIndex = Math.min(index, Math.max(players.length - 1, 0))
    const player = players[safeIndex]
    const nextPlayer = players[safeIndex + 1]

    const { data, isLoading } = useHighlights(player?.username)
    const clips = data?.results ?? []

    // Stage the next applicant while this one is being watched.
    useEffect(() => {
        prefetchHighlights(nextPlayer?.username, { withFirstThumbnail: true })
    }, [nextPlayer?.username, prefetchHighlights])

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        }
    }, [])

    /**
     * Move to another player. The interstitial is dismissed by a timer rather
     * than by load state: prefetching usually makes the load instant, and a card
     * that flashes for 0ms tells the recruiter nothing about who they're watching.
     */
    const goToPlayer = useCallback((nextIndex: number) => {
        setIndex(nextIndex)
        setShowInterstitial(true)
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null
            setShowInterstitial(false)
        }, INTERSTITIAL_MS)
    }, [])

    const nextApplicant = useCallback(() => {
        if (safeIndex >= players.length - 1) {
            onClose()
            return
        }
        goToPlayer(safeIndex + 1)
    }, [goToPlayer, onClose, players.length, safeIndex])

    const prevApplicant = useCallback(() => {
        if (safeIndex <= 0) return
        goToPlayer(safeIndex - 1)
    }, [goToPlayer, safeIndex])

    if (!player) return null

    const label = player.name || player.username
    const sub =
        [player.position, player.sport].filter(Boolean).join(" · ") ||
        player.headline ||
        ""

    /**
     * Hold the stage until this player's clips are in hand.
     *
     * HighlightViewer treats an empty `clips` array as "nothing left to show"
     * and closes itself — correct when the owner deletes the last clip, fatal if
     * we mount it before the fetch resolves. Child effects flush before the
     * parent's, so on a cold cache the viewer would call onClose() before the
     * request was even sent and the modal would vanish on open. The rail never
     * hit this because it only mounts the viewer once it has clips.
     */
    if (isLoading && clips.length === 0) {
        return (
            <div className={styles.loading} role="dialog" aria-modal="true">
                <button
                    type="button"
                    className={styles.loadingClose}
                    onClick={onClose}
                    aria-label="Close highlights"
                >
                    <Icon icon="mdi:close" width={22} height={22} />
                </button>
                <div className={styles.loadingCard}>
                    <Avatar
                        src={player.avatar}
                        initials={label.slice(0, 2).toUpperCase()}
                        size="lg"
                    />
                    <span className={styles.loadingName}>{label}</span>
                    {sub && <span className={styles.loadingSub}>{sub}</span>}
                    <span className={styles.loadingSpinner} aria-hidden="true" />
                </div>
            </div>
        )
    }

    // Stale count (or a reel emptied since the list loaded) — say so, don't jump.
    if (!isLoading && clips.length === 0) {
        return (
            <div className={styles.fallback} role="dialog" aria-modal="true">
                <div className={styles.fallbackCard}>
                    <Avatar
                        src={player.avatar}
                        initials={label.slice(0, 2).toUpperCase()}
                        size="lg"
                    />
                    <p className={styles.fallbackTitle}>
                        No clips available for {label}
                    </p>
                    <p className={styles.fallbackText}>
                        They may have removed them since this list loaded.
                    </p>
                    <div className={styles.fallbackActions}>
                        <button
                            type="button"
                            className={styles.fallbackGhost}
                            onClick={onClose}
                        >
                            Close
                        </button>
                        {safeIndex < players.length - 1 && (
                            <button
                                type="button"
                                className={styles.fallbackPrimary}
                                onClick={nextApplicant}
                            >
                                Next player
                                <Icon icon="mdi:chevron-right" width={16} height={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <HighlightViewer
            /* Remount per player: index, progress and gesture state all belong to
               one reel and must not leak into the next. */
            key={player.username}
            clips={clips}
            owner={{
                username: player.username,
                name: player.name,
                profilePhoto: player.avatar,
                position: player.position ?? player.headline ?? null,
                sport: player.sport ?? null,
            }}
            onClose={onClose}
            onExhausted={nextApplicant}
            onPrevExhausted={safeIndex > 0 ? prevApplicant : undefined}
            headerActions={
                <>
                    <span className={styles.progressPill}>
                        {safeIndex + 1} / {players.length}
                    </span>
                    {renderActions?.(player)}
                </>
            }
            interstitial={
                showInterstitial ? (
                    <div className={styles.interstitial} aria-live="polite">
                        <Avatar
                            src={player.avatar}
                            initials={label.slice(0, 2).toUpperCase()}
                            size="lg"
                        />
                        <span className={styles.interstitialName}>{label}</span>
                        {sub && (
                            <span className={styles.interstitialSub}>{sub}</span>
                        )}
                        <span className={styles.interstitialMeta}>
                            Player {safeIndex + 1} of {players.length}
                        </span>
                    </div>
                ) : null
            }
        />
    )
}
