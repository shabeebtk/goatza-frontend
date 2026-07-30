"use client"

/**
 * HighlightViewer — story-style full-screen player (HIGHLIGHTS_SPEC.md §3).
 *
 * Exactly ONE <video> ever plays. A second, hidden <video preload="metadata">
 * warms the next clip so a swipe starts instantly without a second stream
 * competing for bandwidth.
 *
 * Navigation state changes go through `go()`, never through an effect — the
 * progress bar has to reset in the same tick as the index or the new clip
 * inherits the old clip's fill.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { highlightVideoUrl } from "../../services/highlightUpload.service"
import { useDeleteHighlight } from "../../hooks/useHighlights"
import { useHighlightViews } from "../../hooks/useHighlightViews"
import { VISIBILITY_META } from "../../visibilityMeta"
import type { Highlight } from "../../types"
import styles from "./HighlightViewer.module.css"

export type HighlightViewerOwner = {
    username: string
    name?: string
    profilePhoto?: string
    /** e.g. "Striker" */
    position?: string | null
    /** e.g. "Football" */
    sport?: string | null
}

type HighlightViewerProps = {
    clips: Highlight[]
    startIndex?: number
    owner: HighlightViewerOwner
    /** Owner of the rail, acting as themselves — unlocks the per-clip menu. */
    isOwner?: boolean
    onClose: () => void
    /**
     * Pipeline mode (recruiter review, §3): what to do when the viewer runs off
     * either end of THIS player's reel. Supplied by HighlightPipelineViewer to
     * roll onto the next/previous applicant; without them the viewer just closes
     * at the end, which is what a profile rail wants.
     */
    onExhausted?: () => void
    onPrevExhausted?: () => void
    /** Quick actions (view profile / message / shortlist) under the header. */
    headerActions?: React.ReactNode
    /** Covers the video — used for the between-players interstitial. */
    interstitial?: React.ReactNode
}

/** How long a press must last to mean "pause" rather than "tap". */
const HOLD_MS = 180
/** Swipe thresholds (px). */
const SWIPE_X = 48
const SWIPE_DOWN = 90

export default function HighlightViewer({
    clips,
    startIndex = 0,
    owner,
    isOwner = false,
    onClose,
    onExhausted,
    onPrevExhausted,
    headerActions,
    interstitial,
}: HighlightViewerProps) {
    const [index, setIndex] = useState(() =>
        Math.min(Math.max(startIndex, 0), Math.max(clips.length - 1, 0))
    )
    const [progress, setProgress] = useState(0)
    const [muted, setMuted] = useState(true)
    const [paused, setPaused] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const videoRef = useRef<HTMLVideoElement | null>(null)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const holdTimerRef = useRef<number | null>(null)
    const heldRef = useRef(false)
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
    /** Clips whose video failed — skipped instead of dead-ending the rail. */
    const brokenRef = useRef<Set<string>>(new Set())

    const remove = useDeleteHighlight()
    const { markViewed, cancelPendingView } = useHighlightViews({
        enabled: !isOwner,
    })

    // An index can outlive its clip (the owner just deleted it), so clamp on
    // every render rather than trusting state.
    const safeIndex = Math.min(index, Math.max(clips.length - 1, 0))
    const clip: Highlight | undefined = clips[safeIndex]
    const nextClip: Highlight | undefined = clips[safeIndex + 1]

    const videoSrc = useMemo(
        () => (clip ? highlightVideoUrl(clip.file_url) : ""),
        [clip]
    )

    // ── navigation ─────────────────────────────────────────────

    const go = useCallback(
        (nextIndex: number) => {
            setIndex(nextIndex)
            setProgress(0)
            setPaused(false)
            setMenuOpen(false)
        },
        []
    )

    const goNext = useCallback(() => {
        if (safeIndex >= clips.length - 1) {
            // Pipeline mode rolls onto the next applicant; otherwise we're done.
            if (onExhausted) onExhausted()
            else onClose()
            return
        }
        go(safeIndex + 1)
    }, [clips.length, go, onClose, onExhausted, safeIndex])

    const goPrev = useCallback(() => {
        if (safeIndex <= 0) {
            onPrevExhausted?.()
            return
        }
        go(safeIndex - 1)
    }, [go, onPrevExhausted, safeIndex])

    // ── mount effects: scroll lock, focus trap, keyboard ───────

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        // Move focus in so Esc/arrows work without a click first.
        dialogRef.current?.focus()

        return () => {
            document.body.style.overflow = prevOverflow
            previouslyFocused?.focus?.()
        }
    }, [])

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    e.preventDefault()
                    onClose()
                    break
                case "ArrowRight":
                    e.preventDefault()
                    goNext()
                    break
                case "ArrowLeft":
                    e.preventDefault()
                    goPrev()
                    break
                case " ":
                case "k":
                    e.preventDefault()
                    setPaused((p) => !p)
                    break
                case "m":
                    e.preventDefault()
                    setMuted((m) => !m)
                    break
                case "Tab": {
                    // Focus trap — keep Tab inside the overlay.
                    const root = dialogRef.current
                    if (!root) return
                    const focusable = root.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), [href], video, [tabindex]:not([tabindex="-1"])'
                    )
                    if (focusable.length === 0) return
                    const first = focusable[0]
                    const last = focusable[focusable.length - 1]
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault()
                        last.focus()
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault()
                        first.focus()
                    }
                    break
                }
                default:
                    break
            }
        }

        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [goNext, goPrev, onClose])

    // Nothing left to show (last clip deleted) → leave.
    useEffect(() => {
        if (clips.length === 0) onClose()
    }, [clips.length, onClose])

    // ── playback: one video, driven by index/paused/muted ──────

    useEffect(() => {
        const video = videoRef.current
        if (!video || !videoSrc) return

        video.muted = muted

        if (paused) {
            video.pause()
            return
        }

        // A rejected play() is normal (autoplay policy, or a src swap mid-play)
        // and must not bubble as an unhandled rejection.
        void video.play().catch(() => undefined)
    }, [videoSrc, paused, muted])

    // Count the view once the clip has actually stayed on screen.
    useEffect(() => {
        if (!clip) return
        markViewed(clip.id)
        return () => cancelPendingView()
    }, [clip, markViewed, cancelPendingView])

    // Warm the next poster so the swipe has an image ready even before the
    // hidden <video> reports metadata.
    useEffect(() => {
        if (!nextClip?.thumbnail_url) return
        const img = new Image()
        img.src = nextClip.thumbnail_url
    }, [nextClip?.thumbnail_url])

    // ── video element callbacks ────────────────────────────────

    const onTimeUpdate = useCallback(() => {
        const video = videoRef.current
        if (!video || !video.duration || !Number.isFinite(video.duration)) return
        setProgress(Math.min(1, video.currentTime / video.duration))
    }, [])

    const onError = useCallback(() => {
        if (!clip) return
        if (brokenRef.current.has(clip.id)) return
        brokenRef.current.add(clip.id)

        toast.error("That clip could not be played — skipping.")
        goNext()
    }, [clip, goNext])

    // ── press / swipe gestures ────────────────────────────────

    const clearHold = useCallback(() => {
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current)
            holdTimerRef.current = null
        }
    }, [])

    useEffect(() => () => clearHold(), [clearHold])

    const onPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            pointerStartRef.current = { x: e.clientX, y: e.clientY }
            heldRef.current = false
            clearHold()
            holdTimerRef.current = window.setTimeout(() => {
                heldRef.current = true
                setPaused(true)
            }, HOLD_MS)
        },
        [clearHold]
    )

    const onPointerUp = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            clearHold()

            const start = pointerStartRef.current
            pointerStartRef.current = null

            // Resume from a hold-to-pause.
            if (heldRef.current) {
                heldRef.current = false
                setPaused(false)
                return
            }

            if (!start) return

            const dx = e.clientX - start.x
            const dy = e.clientY - start.y

            if (dy > SWIPE_DOWN && Math.abs(dy) > Math.abs(dx)) {
                onClose()
                return
            }
            if (Math.abs(dx) > SWIPE_X) {
                if (dx < 0) goNext()
                else goPrev()
                return
            }

            // A plain tap toggles sound — the clip starts muted by policy, so
            // the first tap is how you hear it.
            setMuted((m) => !m)
        },
        [clearHold, goNext, goPrev, onClose]
    )

    const onPointerCancel = useCallback(() => {
        clearHold()
        pointerStartRef.current = null
        if (heldRef.current) {
            heldRef.current = false
            setPaused(false)
        }
    }, [clearHold])

    // ── owner actions ──────────────────────────────────────────

    const placeholder = useCallback(() => {
        setMenuOpen(false)
        toast("Managing highlights is coming next", {
            description: "Editing the title and visibility lands with the manage screen.",
        })
    }, [])

    const onConfirmDelete = useCallback(() => {
        if (!clip) return
        const wasLast = clips.length <= 1
        setConfirmDelete(false)
        setMenuOpen(false)
        remove.mutate(clip.id)
        // The rail owns the list; this component just stops pointing past its end.
        if (wasLast) onClose()
        else if (safeIndex >= clips.length - 1) go(Math.max(0, safeIndex - 1))
    }, [clip, clips.length, go, onClose, remove, safeIndex])

    if (!clip) return null

    const subtitle = [owner.position, owner.sport].filter(Boolean).join(" · ")
    const visibility = clip.visibility
        ? VISIBILITY_META[clip.visibility]
        : undefined

    return createPortal(
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label={`Highlights of ${owner.name || owner.username}`}
            ref={dialogRef}
            tabIndex={-1}
        >
            <div className={styles.stage}>
                {/* ── Segmented progress ── */}
                <div className={styles.segments} aria-hidden="true">
                    {clips.map((c, i) => (
                        <span key={c.id} className={styles.segment}>
                            <span
                                className={styles.segmentFill}
                                style={{
                                    transform: `scaleX(${
                                        i < safeIndex
                                            ? 1
                                            : i === safeIndex
                                              ? progress
                                              : 0
                                    })`,
                                }}
                            />
                        </span>
                    ))}
                </div>

                {/* ── Header ── */}
                <header className={styles.header}>
                  <div className={styles.headerTop}>
                    <Avatar
                        src={owner.profilePhoto}
                        initials={(owner.name || owner.username)
                            .slice(0, 2)
                            .toUpperCase()}
                        size="sm"
                    />
                    <div className={styles.identity}>
                        <span className={styles.name}>
                            {owner.name || owner.username}
                        </span>
                        {subtitle && (
                            <span className={styles.subtitle}>{subtitle}</span>
                        )}
                    </div>

                    {isOwner && visibility && (
                        <span className={styles.visibilityBadge}>
                            <Icon icon={visibility.icon} width={13} height={13} />
                            {visibility.label}
                        </span>
                    )}

                    {isOwner && (
                        <div className={styles.menuWrap}>
                            <button
                                type="button"
                                className={styles.iconBtn}
                                aria-label="Clip options"
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((o) => !o)}
                            >
                                <Icon icon="mdi:dots-vertical" width={20} height={20} />
                            </button>

                            {menuOpen && (
                                <div className={styles.menu} role="menu">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuItem}
                                        onClick={placeholder}
                                    >
                                        <Icon icon="mdi:pencil-outline" width={16} height={16} />
                                        Edit title
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuItem}
                                        onClick={placeholder}
                                    >
                                        <Icon icon="mdi:eye-outline" width={16} height={16} />
                                        Change visibility
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                        onClick={() => {
                                            setMenuOpen(false)
                                            setConfirmDelete(true)
                                        }}
                                    >
                                        <Icon icon="mdi:trash-can-outline" width={16} height={16} />
                                        Delete clip
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Close highlights"
                        onClick={onClose}
                    >
                        <Icon icon="mdi:close" width={22} height={22} />
                    </button>
                  </div>

                  {/* Quick actions (recruiter surfaces) — a second header line so
                      they never squeeze the name on a phone. */}
                  {headerActions && (
                    <div className={styles.headerActions}>{headerActions}</div>
                  )}
                </header>

                {/* ── Video surface ── */}
                <div
                    className={styles.videoArea}
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerLeave={onPointerCancel}
                >
                    <video
                        ref={videoRef}
                        key={clip.id}
                        className={styles.video}
                        src={videoSrc}
                        poster={clip.thumbnail_url || undefined}
                        autoPlay
                        muted={muted}
                        playsInline
                        preload="auto"
                        onTimeUpdate={onTimeUpdate}
                        onEnded={goNext}
                        onError={onError}
                    />

                    {/* Next clip's metadata only — never a second stream playing. */}
                    {nextClip && (
                        <video
                            className={styles.preload}
                            src={highlightVideoUrl(nextClip.file_url)}
                            preload="metadata"
                            muted
                            playsInline
                            tabIndex={-1}
                            aria-hidden="true"
                        />
                    )}

                    {paused && (
                        <span className={styles.pausedBadge} aria-hidden="true">
                            <Icon icon="mdi:pause" width={30} height={30} />
                        </span>
                    )}

                    {muted && (
                        <span className={styles.mutedHint}>
                            <Icon icon="mdi:volume-off" width={15} height={15} />
                            Tap for sound
                        </span>
                    )}

                    {clip.title && (
                        <p className={styles.clipTitle}>{clip.title}</p>
                    )}

                    {interstitial}
                </div>

                {/* ── Desktop arrows ── */}
                <button
                    type="button"
                    className={`${styles.nav} ${styles.navPrev}`}
                    aria-label="Previous clip"
                    onClick={goPrev}
                    disabled={safeIndex === 0 && !onPrevExhausted}
                >
                    <Icon icon="mdi:chevron-left" width={26} height={26} />
                </button>
                <button
                    type="button"
                    className={`${styles.nav} ${styles.navNext}`}
                    aria-label="Next clip"
                    onClick={goNext}
                >
                    <Icon icon="mdi:chevron-right" width={26} height={26} />
                </button>
            </div>

            {confirmDelete && (
                <div className={styles.confirmBackdrop}>
                    <div className={styles.confirmCard}>
                        <h3 className={styles.confirmTitle}>Delete this clip?</h3>
                        <p className={styles.confirmText}>
                            It will be removed from your highlights. This frees a slot
                            towards your 10.
                        </p>
                        <div className={styles.confirmActions}>
                            <button
                                type="button"
                                className={styles.confirmKeep}
                                onClick={() => setConfirmDelete(false)}
                            >
                                Keep
                            </button>
                            <button
                                type="button"
                                className={styles.confirmDelete}
                                onClick={onConfirmDelete}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    )
}
