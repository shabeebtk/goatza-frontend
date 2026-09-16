"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { ChatMessage } from "../../hooks/useChatSocket"
import { formatDuration } from "../../services/chatUpload.service"
// The stored object IS the clip that plays and the poster that shows — no
// derivative is built any more, so these just read the right field.
import { posterSrc, videoSrc } from "@/shared/services/mediaDelivery"
import { OPTIMIZING_LABEL } from "@/shared/services/videoEncode"
// The full-screen player: the same media-only viewer chat photos and
// recruitment media open in, bound to the global sound store, with the
// back gesture closing it. The local native-controls player it replaced
// was the one <video> in the app that looked like a browser, not the app.
import MediaLightbox from "@/shared/components/ImageLightbox/MediaLightbox"
// Space is reserved from intrinsic dimensions so the poster never causes layout
// shift while it loads. Shared with ImageMessage.
import { displaySize } from "../../utils/mediaBox"
import styles from "./VideoMessage.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"

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
    useBodyScrollLock()

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onKeep()
        }
        document.addEventListener("keydown", onKey)
        return () => {
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
    /** Read by the other participant — paints the ticks blue. */
    seen?: boolean
    onRetry?: () => void
    onRemove?: () => void
}

export default function VideoMessage({
    msg,
    isMine,
    showTime,
    timeLabel,
    seen,
    onRetry,
    onRemove,
}: VideoMessageProps) {
    const [playerOpen, setPlayerOpen] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const isOptimistic = !msg.media_url
    const isUploading = Boolean(msg.pending) && !msg.failed
    const isFailed = Boolean(msg.failed)

    const { w, h, known } = displaySize(msg.media_width, msg.media_height)

    // Poster: optimistic → the locally captured frame (a blob: URL, which the
    // delivery helpers pass through verbatim); server → the stored poster
    // object, falling back to the local frame while one is still in flight.
    const poster = isOptimistic
        ? msg.localPreviewUrl
        : posterSrc(msg) || msg.localPreviewUrl

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
                                {/* The encode is the first 70% of the bar and
                                    the slower half on a phone — saying
                                    "Uploading" through it reads as a stall. */}
                                {msg.optimizing ? OPTIMIZING_LABEL : "Uploading"}{" "}
                                {Math.round(msg.uploadProgress ?? 0)}%
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
                                className={
                                    seen && !isUploading ? styles.seenIcon : ""
                                }
                            />
                        )}
                    </span>
                )}
            </div>

            {playerOpen && (
                <MediaLightbox
                    media={[{
                        id: msg.id,
                        media_type: "video",
                        file_url: videoSrc(msg),
                        thumbnail_url: posterSrc(msg) || undefined,
                        duration: durationSec || undefined,
                    }]}
                    label="Video player"
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
