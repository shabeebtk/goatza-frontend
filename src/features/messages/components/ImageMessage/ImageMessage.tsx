"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import type { ChatMessage } from "../../hooks/useChatSocket"
import { cloudinaryThumb } from "../../services/chatUpload.service"
// Space is reserved from intrinsic dimensions so the image never causes layout
// shift while it loads. Shared with VideoMessage.
import { displaySize } from "../../utils/mediaBox"
import styles from "./ImageMessage.module.css"

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
                    This photo won&rsquo;t be sent.
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

// ── ImageMessage ──────────────────────────────────────────────

interface ImageMessageProps {
    msg: ChatMessage
    isMine: boolean
    showTime: boolean
    timeLabel: string
    /** Read by the other participant — paints the ticks blue. */
    seen?: boolean
    onRetry?: () => void
    onRemove?: () => void
}

export default function ImageMessage({
    msg,
    isMine,
    showTime,
    timeLabel,
    seen,
    onRetry,
    onRemove,
}: ImageMessageProps) {
    const [viewerOpen, setViewerOpen] = useState(false)
    const [confirmCancel, setConfirmCancel] = useState(false)

    const isOptimistic = Boolean(msg.localPreviewUrl)
    const isUploading = Boolean(msg.pending) && !msg.failed
    const isFailed = Boolean(msg.failed)

    const { w, h, known } = displaySize(msg.media_width, msg.media_height)

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
                    /* aspect-ratio (not a fixed height) so the box stays
                       correctly proportioned when `.column`'s max-width clamps
                       it on narrow screens. */
                    style={{ width: w, aspectRatio: `${w} / ${h}` }}
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
                            known ? "" : styles.imageContain
                        } ${isUploading ? styles.imageUploading : ""}`}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                    />

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
                                className={
                                    seen && !isUploading ? styles.seenIcon : ""
                                }
                            />
                        )}
                    </span>
                )}
            </div>

            {viewerOpen && (
                <ImageViewer src={fullSrc} onClose={() => setViewerOpen(false)} />
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
