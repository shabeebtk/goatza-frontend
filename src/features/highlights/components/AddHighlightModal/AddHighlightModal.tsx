"use client"

/**
 * AddHighlightModal — the "+" tile's flow, shaped like CreatePostModal:
 * full-screen on a phone, a centred card from 640px up.
 *
 * Pick → local preview (the picked file plays straight from an object URL, so
 * the player sees exactly what they are about to publish) → title + visibility →
 * upload with live progress → created.
 *
 * The upload itself is `useHighlightUpload`; this component only stages the file
 * and renders progress, so validation, the 90s cap, cancel and retry behave
 * identically to every other entry point.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useHighlightUpload } from "../../hooks/useHighlightUpload"
import {
    MAX_HIGHLIGHT_MB,
    MAX_HIGHLIGHT_SECONDS,
    checkHighlightDuration,
    validateHighlightFile,
    type HighlightVideoMeta,
} from "../../services/highlightUpload.service"
import { HIGHLIGHT_VISIBILITIES, type HighlightVisibility } from "../../types"
import { VISIBILITY_META, formatClipDuration } from "../../visibilityMeta"
import styles from "./AddHighlightModal.module.css"

const MAX_TITLE = 80

type AddHighlightModalProps = {
    onClose: () => void
    /** Fired after the clip is created, before the modal closes. */
    onCreated?: () => void
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Tap-to-play preview with no native player chrome — same treatment as the post
 * composer. `controls` would hand the browser a download button, a playback-rate
 * menu and fullscreen, none of which belong in a staging preview.
 */
function PreviewVideo({ src }: { src: string }) {
    const ref = useRef<HTMLVideoElement>(null)
    const [playing, setPlaying] = useState(false)

    const toggle = () => {
        const video = ref.current
        if (!video) return
        if (video.paused) void video.play().catch(() => undefined)
        else video.pause()
    }

    return (
        <div className={styles.previewVideoWrap} onClick={toggle}>
            <video
                ref={ref}
                src={src}
                className={styles.previewVideo}
                playsInline
                preload="metadata"
                disablePictureInPicture
                controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onContextMenu={(e) => e.preventDefault()}
            />
            {!playing && (
                <div className={styles.previewPlayOverlay}>
                    <span className={styles.previewPlayBtn}>
                        <Icon icon="mdi:play" width={26} height={26} />
                    </span>
                </div>
            )}
        </div>
    )
}

export default function AddHighlightModal({
    onClose,
    onCreated,
}: AddHighlightModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [durationSec, setDurationSec] = useState<number | null>(null)
    const [pickError, setPickError] = useState<string | null>(null)
    const [title, setTitle] = useState("")
    const [visibility, setVisibility] = useState<HighlightVisibility>(
        "followers_and_recruiters"
    )

    const inputRef = useRef<HTMLInputElement | null>(null)
    const previewUrlRef = useRef<string | null>(null)
    /** What the pick-time probe found, handed to the upload so it isn't redone. */
    const metaRef = useRef<HighlightVideoMeta | null>(null)

    const upload = useHighlightUpload({
        onCreated: () => {
            onCreated?.()
            onClose()
        },
    })

    // Lock the page behind the modal, and let Escape out when nothing is
    // in flight (closing mid-upload would orphan the progress UI).
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = prev
        }
    }, [])

    useEffect(
        () => () => {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        },
        []
    )

    const isBusy = upload.isBusy

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isBusy) onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [isBusy, onClose])

    const clearPreview = useCallback(() => {
        if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
            previewUrlRef.current = null
        }
        setPreviewUrl(null)
        setDurationSec(null)
    }, [])

    const pickFile = useCallback(
        async (picked: File) => {
            setPickError(null)
            upload.reset()

            const problem = validateHighlightFile(picked)
            if (problem) {
                setPickError(problem)
                return
            }

            // Same probe the upload uses, so the 90s cap is enforced here too —
            // before the file is staged, not after the user hits Add.
            const { meta, error } = await checkHighlightDuration(picked)
            if (error) {
                setPickError(error)
                return
            }

            clearPreview()
            const url = URL.createObjectURL(picked)
            previewUrlRef.current = url
            metaRef.current = meta

            setFile(picked)
            setPreviewUrl(url)
            setDurationSec(meta?.durationSec ?? null)
        },
        [clearPreview, upload]
    )

    const removeFile = useCallback(() => {
        clearPreview()
        setFile(null)
        setPickError(null)
        upload.reset()
    }, [clearPreview, upload])

    const submit = useCallback(() => {
        if (!file || isBusy) return
        void upload.start(file, {
            title: title.trim() || undefined,
            visibility,
            // Already probed while staging the preview — don't re-probe and
            // delay the first progress tick.
            knownMeta: durationSec != null ? metaRef.current : null,
        })
    }, [durationSec, file, isBusy, title, upload, visibility])

    const statusLabel =
        upload.status === "checking"
            ? "Checking clip…"
            : upload.status === "saving"
              ? "Finishing up…"
              : `Uploading… ${upload.progress}%`

    return createPortal(
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Add a highlight"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isBusy) onClose()
            }}
        >
            <div className={styles.modal}>
                {/* ── Header ── */}
                <header className={styles.header}>
                    <button
                        type="button"
                        className={styles.headerBtn}
                        onClick={onClose}
                        disabled={isBusy}
                        aria-label="Close"
                    >
                        <Icon icon="mdi:close" width={22} height={22} />
                    </button>

                    <h2 className={styles.headerTitle}>New highlight</h2>

                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={submit}
                        disabled={!file || isBusy}
                    >
                        {isBusy ? "Adding…" : "Add"}
                    </button>
                </header>

                {/* ── Body ── */}
                <div className={styles.body}>
                    {!file ? (
                        <>
                            <button
                                type="button"
                                className={styles.dropzone}
                                onClick={() => inputRef.current?.click()}
                            >
                                <span className={styles.dropIcon}>
                                    <Icon icon="mdi:video-plus-outline" width={30} height={30} />
                                </span>
                                <span className={styles.dropTitle}>
                                    Choose a video
                                </span>
                                <span className={styles.dropHint}>
                                    MP4, MOV or WebM · up to {MAX_HIGHLIGHT_SECONDS}s ·
                                    under {MAX_HIGHLIGHT_MB} MB
                                </span>
                            </button>

                            {pickError && (
                                <p className={styles.error} role="alert">
                                    <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                                    {pickError}
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Preview — the clip itself, 9:16 like the rail tile */}
                            <div className={styles.previewRow}>
                                <div className={styles.preview}>
                                    {previewUrl && (
                                        <PreviewVideo src={previewUrl} />
                                    )}
                                    {durationSec != null && durationSec > 0 && (
                                        <span className={styles.previewDuration}>
                                            {formatClipDuration(durationSec)}
                                        </span>
                                    )}
                                </div>

                                <div className={styles.fileMeta}>
                                    <span className={styles.fileName}>{file.name}</span>
                                    <span className={styles.fileSize}>
                                        {formatBytes(file.size)}
                                        {durationSec
                                            ? ` · ${Math.round(durationSec)}s`
                                            : ""}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.replaceBtn}
                                        onClick={removeFile}
                                        disabled={isBusy}
                                    >
                                        <Icon icon="mdi:swap-horizontal" width={14} height={14} />
                                        Choose another
                                    </button>
                                </div>
                            </div>

                            {/* Title */}
                            <label className={styles.label} htmlFor="highlight-title">
                                Title <span className={styles.optional}>(optional)</span>
                            </label>
                            <div className={styles.titleField}>
                                <input
                                    id="highlight-title"
                                    className={styles.titleInput}
                                    value={title}
                                    maxLength={MAX_TITLE}
                                    placeholder="e.g. Free kick vs St. Mary's"
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={isBusy}
                                />
                                <span className={styles.counter}>
                                    {title.length}/{MAX_TITLE}
                                </span>
                            </div>

                            {/* Visibility */}
                            <span className={styles.label}>Who can watch</span>
                            <div
                                className={styles.segmented}
                                role="radiogroup"
                                aria-label="Visibility"
                            >
                                {HIGHLIGHT_VISIBILITIES.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="radio"
                                        aria-checked={visibility === value}
                                        className={`${styles.segment} ${
                                            visibility === value ? styles.segmentActive : ""
                                        }`}
                                        onClick={() => setVisibility(value)}
                                        disabled={isBusy}
                                    >
                                        <Icon
                                            icon={VISIBILITY_META[value].icon}
                                            width={14}
                                            height={14}
                                        />
                                        {VISIBILITY_META[value].label}
                                    </button>
                                ))}
                            </div>
                            <p className={styles.explanation}>
                                {VISIBILITY_META[visibility].explanation}
                            </p>

                            {upload.error && !isBusy && (
                                <p className={styles.error} role="alert">
                                    <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                                    {upload.error}
                                    {upload.canRetry && (
                                        <button
                                            type="button"
                                            className={styles.retryBtn}
                                            onClick={upload.retry}
                                        >
                                            Retry
                                        </button>
                                    )}
                                </p>
                            )}
                        </>
                    )}

                    <input
                        ref={inputRef}
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm"
                        className={styles.fileInput}
                        onChange={(e) => {
                            const picked = e.target.files?.[0]
                            // Reset first so re-picking the same file still fires.
                            e.target.value = ""
                            if (picked) void pickFile(picked)
                        }}
                    />
                </div>

                {/* ── Progress ──
                    Pinned OUTSIDE the scrolling body (same as CreatePostModal):
                    inside it, the bar sat below the fold on a phone and the
                    upload looked like it was doing nothing. */}
                {isBusy && (
                    <div className={styles.uploadSection}>
                        <div className={styles.uploadHeader}>
                            <span className={styles.uploadLabel}>
                                <span className={styles.uploadSpinner} aria-hidden="true" />
                                {statusLabel}
                            </span>
                            <button
                                type="button"
                                className={styles.cancelBtn}
                                onClick={upload.cancel}
                            >
                                Cancel
                            </button>
                        </div>

                        <div className={styles.barTrack}>
                            <div
                                className={`${styles.barFill} ${
                                    upload.status !== "uploading"
                                        ? styles.barFillIndeterminate
                                        : ""
                                }`}
                                style={{
                                    width:
                                        upload.status === "uploading"
                                            ? `${Math.max(upload.progress, 3)}%`
                                            : "100%",
                                }}
                            />
                        </div>

                        {file && (
                            <span className={styles.uploadFile}>
                                {file.name} · {formatBytes(file.size)}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
