"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { ChatMessage } from "../../hooks/useChatSocket"
import { cloudinaryThumb } from "../../services/chatUpload.service"
import styles from "./ImageMessage.module.css"

// Bubble display caps — space is reserved from intrinsic dimensions so the
// image never causes layout shift while it loads.
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

// ── Fullscreen viewer (single image) ──────────────────────────

function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
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
            aria-label="Photo viewer"
            onClick={onClose}
        >
            <button className={styles.viewerClose} type="button" aria-label="Close">
                <Icon icon="mdi:close" width={24} height={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className={styles.viewerImg} />
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

// ── ImageMessage ──────────────────────────────────────────────

interface ImageMessageProps {
    msg: ChatMessage
    isMine: boolean
    showTime: boolean
    timeLabel: string
    onRetry?: () => void
    onRemove?: () => void
}

export default function ImageMessage({
    msg,
    isMine,
    showTime,
    timeLabel,
    onRetry,
    onRemove,
}: ImageMessageProps) {
    const [viewerOpen, setViewerOpen] = useState(false)

    const isOptimistic = Boolean(msg.localPreviewUrl)
    const isUploading = Boolean(msg.pending) && !msg.failed
    const isFailed = Boolean(msg.failed)

    const { w, h } = displaySize(msg.media_width, msg.media_height)

    // Optimistic → local object URL; server → a sized Cloudinary derivative
    // (never the full original in the bubble). Full-res only in the viewer.
    const bubbleSrc = isOptimistic
        ? msg.localPreviewUrl!
        : cloudinaryThumb(msg.media_url || "", 640)
    const fullSrc = msg.media_url || msg.localPreviewUrl || ""

    const canOpen = !isOptimistic && !isFailed && Boolean(msg.media_url)

    const caption = msg.content?.trim()

    return (
        <div
            className={`${styles.row} ${isMine ? styles.rowMine : styles.rowTheirs}`}
        >
            <div className={styles.column}>
                <div
                    className={styles.imageWrap}
                    style={{ width: w, height: h }}
                    role={canOpen ? "button" : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    onClick={canOpen ? () => setViewerOpen(true) : undefined}
                    onKeyDown={
                        canOpen
                            ? (e) => e.key === "Enter" && setViewerOpen(true)
                            : undefined
                    }
                    aria-label={canOpen ? "View photo" : undefined}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={bubbleSrc}
                        alt=""
                        className={`${styles.image} ${
                            isUploading ? styles.imageUploading : ""
                        }`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                    />

                    {/* Uploading overlay */}
                    {isUploading && (
                        <div className={styles.overlay}>
                            <ProgressRing progress={msg.uploadProgress ?? 0} />
                        </div>
                    )}

                    {/* Failed overlay — tap ring to retry, X to remove */}
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
                                aria-label="Remove photo"
                            >
                                <Icon icon="mdi:close" width={16} height={16} />
                            </button>
                            <span className={styles.failedLabel}>
                                Upload failed
                            </span>
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

            {viewerOpen && (
                <ImageViewer src={fullSrc} onClose={() => setViewerOpen(false)} />
            )}
        </div>
    )
}
