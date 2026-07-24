"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { ChatMessage } from "../../hooks/useChatSocket"
import { formatDuration } from "../../services/chatUpload.service"
// Space is reserved from intrinsic dimensions so the poster never causes layout
// shift while it loads. Shared with ImageMessage.
import { displaySize } from "../../utils/mediaBox"
import styles from "./VideoMessage.module.css"

// ── Fullscreen player ─────────────────────────────────────────

function VideoPlayer({
    src,
    poster,
    onClose,
}: {
    src: string
    poster?: string
    onClose: () => void
}) {
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = prev
            document.removeEventListener("keydown", onKey)
        }
    }, [onClose])

    return createPortal(
        <div
            className={styles.viewer}
            role="dialog"
            aria-modal="true"
            aria-label="Video player"
            onClick={onClose}
        >
            <button className={styles.viewerClose} type="button" aria-label="Close">
                <Icon icon="mdi:close" width={24} height={24} />
            </button>
            <video
                src={src}
                poster={poster || undefined}
                className={styles.viewerVideo}
                controls
                autoPlay
                playsInline
                // Stop the backdrop's onClick from closing while using controls.
                onClick={(e) => e.stopPropagation()}
            />
        </div>,
        document.body
    )
}

// ── Progress ring ─────────────────────────────────────────────

function ProgressRing({ progress }: { progress: number }) {
    const r = 24
    const c = 2 * Math.PI * r
    const dash = c * (1 - Math.min(100, Math.max(0, progress)) / 100)
    return (
        <svg className={styles.ring} viewBox="0 0 56 56" width={56} height={56}>
            <circle className={styles.ringTrack} cx="28" cy="28" r={r} />
            <circle
                className={styles.ringFill}
                cx="28"
                cy="28"
                r={r}
                strokeDasharray={c}
                strokeDashoffset={dash}
            />
        </svg>
    )
}

// ── Cancel-upload confirmation ────────────────────────────────

function CancelConfirm({
    onKeep,
    onConfirm,
}: {
    onKeep: () => void
    onConfirm: () => void
}) {
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onKeep()
        }
        document.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = prev
            document.removeEventListener("keydown", onKey)
        }
    }, [onKeep])

    return createPortal(
        <div
            className={styles.confirmBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Cancel upload"
            onClick={onKeep}
        >
            <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
                <span className={styles.confirmIcon}>
                    <Icon icon="mdi:close-circle-outline" width={26} height={26} />
                </span>
                <h3 className={styles.confirmTitle}>Cancel upload?</h3>
                <p className={styles.confirmText}>
                    This video won&rsquo;t be sent.
                </p>
                <div className={styles.confirmActions}>
                    <button
                        type="button"
                        className={styles.confirmKeep}
                        onClick={onKeep}
                    >
                        Keep uploading
                    </button>
                    <button
                        type="button"
                        className={styles.confirmCancel}
                        onClick={onConfirm}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

// ── VideoMessage ──────────────────────────────────────────────

interface VideoMessageProps {
    msg: ChatMessage
    isMine: boolean
    showTime: boolean
    timeLabel: string
    onRetry?: () => void
    onRemove?: () => void
}

export default function VideoMessage({
    msg,
    isMine,
    showTime,
    timeLabel,
    onRetry,
    onRemove,
}: VideoMessageProps) {
    const [playerOpen, setPlayerOpen] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const isOptimistic = !msg.media_url
    const isUploading = Boolean(msg.pending) && !msg.failed
    const isFailed = Boolean(msg.failed)

    const { w, h, known } = displaySize(msg.media_width, msg.media_height)

    // Poster: optimistic → locally captured frame; server → Cloudinary poster.
    const poster = isOptimistic
        ? msg.localPreviewUrl
        : msg.media_thumbnail_url || msg.localPreviewUrl

    const durationSec = msg.media_duration_ms
        ? msg.media_duration_ms / 1000
        : 0

    const canPlay = !isOptimistic && !isFailed && Boolean(msg.media_url)
    const caption = msg.content?.trim()

    return (
        <div
            className={`${styles.row} ${isMine ? styles.rowMine : styles.rowTheirs}`}
        >
            <div className={styles.column}>
                <div
                    className={styles.videoWrap}
                    /* aspect-ratio (not a fixed height) so the box stays
                       correctly proportioned when `.column`'s max-width clamps
                       it on narrow screens. */
                    style={{ width: w, aspectRatio: `${w} / ${h}` }}
                    role={canPlay ? "button" : undefined}
                    tabIndex={canPlay ? 0 : undefined}
                    onClick={canPlay ? () => setPlayerOpen(true) : undefined}
                    onKeyDown={
                        canPlay
                            ? (e) => e.key === "Enter" && setPlayerOpen(true)
                            : undefined
                    }
                    aria-label={canPlay ? "Play video" : undefined}
                >
                    {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={poster}
                            alt=""
                            className={`${styles.poster} ${
                                known ? "" : styles.posterContain
                            } ${isUploading ? styles.posterUploading : ""}`}
                            loading="lazy"
                            decoding="async"
                            draggable={false}
                        />
                    ) : (
                        <div className={styles.posterFallback} />
                    )}

                    {/* Play button — only when the video is playable */}
                    {canPlay && (
                        <span className={styles.playBtn}>
                            <Icon icon="mdi:play" width={26} height={26} />
                        </span>
                    )}

                    {/* Duration badge */}
                    {durationSec > 0 && !isUploading && !isFailed && (
                        <span className={styles.durationBadge}>
                            {formatDuration(durationSec)}
                        </span>
                    )}

                    {/* Uploading overlay — progress ring with a centered ✕ to
                        cancel (opens a confirmation first). */}
                    {isUploading && (
                        <div className={styles.overlay}>
                            <button
                                type="button"
                                className={styles.cancelRing}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmCancel(true)
                                }}
                                aria-label="Cancel upload"
                            >
                                <ProgressRing progress={msg.uploadProgress ?? 0} />
                                <span className={styles.cancelIcon}>
                                    <Icon icon="mdi:close" width={20} height={20} />
                                </span>
                            </button>
                            <span className={styles.uploadingLabel}>
                                Uploading {Math.round(msg.uploadProgress ?? 0)}%
                            </span>
                        </div>
                    )}

                    {/* Failed overlay */}
                    {isFailed && (
                        <div className={styles.overlay}>
                            <button
                                type="button"
                                className={styles.retryBtn}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRetry?.()
                                }}
                                aria-label="Retry upload"
                            >
                                <Icon icon="mdi:refresh" width={16} height={16} />
                                Retry
                            </button>
                            <button
                                type="button"
                                className={styles.removeBtn}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRemove?.()
                                }}
                                aria-label="Remove video"
                            >
                                <Icon icon="mdi:close" width={16} height={16} />
                            </button>
                            <span className={styles.failedLabel}>Upload failed</span>
                        </div>
                    )}
                </div>

                {caption && (
                    <span
                        className={`${styles.caption} ${
                            isMine ? styles.captionMine : ""
                        }`}
                    >
                        {caption}
                    </span>
                )}

                {showTime && (
                    <span className={styles.time}>
                        {timeLabel}
                        {isMine && !isFailed && (
                            <Icon
                                icon={
                                    isUploading
                                        ? "mdi:clock-outline"
                                        : "mdi:check-all"
                                }
                                width={11}
                                height={11}
                            />
                        )}
                    </span>
                )}
            </div>

            {playerOpen && (
                <VideoPlayer
                    src={msg.media_url || ""}
                    poster={msg.media_thumbnail_url}
                    onClose={() => setPlayerOpen(false)}
                />
            )}

            {confirmCancel && (
                <CancelConfirm
                    onKeep={() => setConfirmCancel(false)}
                    onConfirm={() => {
                        setConfirmCancel(false)
                        onRemove?.()
                    }}
                />
            )}
        </div>
    )
}
