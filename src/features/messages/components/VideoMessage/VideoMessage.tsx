"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { ChatMessage } from "../../hooks/useChatSocket"
import { formatDuration } from "../../services/chatUpload.service"
import styles from "./VideoMessage.module.css"

const MAX_W = 260
const MAX_H = 320

function displaySize(width?: number | null, height?: number | null) {
    const ratio = width && height ? width / height : 1
    let w = MAX_W
    let h = MAX_W / ratio
    if (h > MAX_H) {
        h = MAX_H
        w = MAX_H * ratio
    }
    return { w: Math.round(w), h: Math.round(h) }
}

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
    const r = 18
    const c = 2 * Math.PI * r
    const dash = c * (1 - Math.min(100, Math.max(0, progress)) / 100)
    return (
        <svg className={styles.ring} viewBox="0 0 44 44" width={44} height={44}>
            <circle className={styles.ringTrack} cx="22" cy="22" r={r} />
            <circle
                className={styles.ringFill}
                cx="22"
                cy="22"
                r={r}
                strokeDasharray={c}
                strokeDashoffset={dash}
            />
        </svg>
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

    const isOptimistic = !msg.media_url
    const isUploading = Boolean(msg.pending) && !msg.failed
    const isFailed = Boolean(msg.failed)

    const { w, h } = displaySize(msg.media_width, msg.media_height)

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
                    style={{ width: w, height: h }}
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
                                isUploading ? styles.posterUploading : ""
                            }`}
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

                    {/* Uploading overlay */}
                    {isUploading && (
                        <div className={styles.overlay}>
                            <ProgressRing progress={msg.uploadProgress ?? 0} />
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
                                <Icon icon="mdi:refresh" width={22} height={22} />
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
        </div>
    )
}
