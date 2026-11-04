"use client"

/**
 * AddHighlightModal — the "+" tile's flow, shaped like CreatePostModal:
 * full-screen on a phone, a centred card from 640px up.
 *
 * Pick → local preview (the picked file plays straight from an object URL, so
 * the player sees exactly what they are about to publish) → title + visibility →
 * Add → the clip goes to the background upload queue and the modal closes.
 * UploadScreen opens in its place, with the progress, a failure and its Retry;
 * "Highlight added" opens the profile, or says so on the pill if minimized.
 *
 * The checks a player can act on run here, before Add: the format, the size,
 * the 90s cap (on the picked file's metadata) and a full rail.
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
import { videoAcceptFor } from "@/shared/constants/media"
import { useMediaCapabilities } from "@/shared/services/mediaCapabilities"
import { HIGHLIGHT_VISIBILITIES, type HighlightVisibility } from "../../types"
import { VISIBILITY_META, formatClipDuration } from "../../visibilityMeta"
import styles from "./AddHighlightModal.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { revealChrome } from "@/shared/hooks/useScrollChrome"
import { useSuspendPlayback } from "@/shared/media/playback"
import { settleViewport } from "@/shared/utils/settleViewport"

const MAX_TITLE = 80

type AddHighlightModalProps = {
    onClose: () => void
    /**
     * Clips already on the rail, from the list the opening screen loaded —
     * so a full rail is refused here rather than after the upload.
     */
    existingCount: number
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
    existingCount,
}: AddHighlightModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [durationSec, setDurationSec] = useState<number | null>(null)
    const [pickError, setPickError] = useState<string | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [title, setTitle] = useState("")
    const [visibility, setVisibility] = useState<HighlightVisibility>(
        "followers_and_recruiters"
    )

    const inputRef = useRef<HTMLInputElement | null>(null)
    const previewUrlRef = useRef<string | null>(null)
    /** What the pick-time probe found, handed to the upload so it isn't redone. */
    const metaRef = useRef<HighlightVideoMeta | null>(null)

    const upload = useHighlightUpload({ existingCount })
    // Whether the server converts what the phone cannot: wider formats.
    const { server_processing: serverProcessing } = useMediaCapabilities()

    // Lock the page behind the modal; Escape closes it — nothing here is in
    // flight any more, the queue owns the upload.
    useBodyScrollLock()
    useSuspendPlayback()
    // However it closes: the bars may have been scrolled away when it opened.
    useEffect(() => revealChrome, [])

    useEffect(
        () => () => {
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        },
        []
    )

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [onClose])

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
            setSubmitError(null)

            const problem = validateHighlightFile(picked, { serverProcessing })
            if (problem) {
                setPickError(problem)
                return
            }

            // The same probe the upload falls back to, so the 90s cap is
            // enforced here too — before the file is staged, not after Add.
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
        [clearPreview, serverProcessing]
    )

    const removeFile = useCallback(() => {
        clearPreview()
        setFile(null)
        setPickError(null)
        setSubmitError(null)
    }, [clearPreview])

    const submit = useCallback(() => {
        if (!file) return
        const refused = upload.start({
            file,
            // Already probed while staging the preview — the encoder's own
            // measurement wins; this is only its fallback.
            meta: durationSec != null ? metaRef.current : null,
            title: title.trim() || undefined,
            visibility,
        })
        if (refused) {
            setSubmitError(refused)
            return
        }
        // The title's keyboard may still be up. The upload screen covers the
        // page while it goes away.
        void settleViewport()
        onClose()
    }, [durationSec, file, onClose, title, upload, visibility])

    return createPortal(
        <div
            className={styles.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Add a highlight"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className={styles.modal}>
                {/* ── Header ── */}
                <header className={styles.header}>
                    <button
                        type="button"
                        className={styles.headerBtn}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <Icon icon="mdi:close" width={22} height={22} />
                    </button>

                    <h2 className={styles.headerTitle}>New highlight</h2>

                    <button
                        type="button"
                        className={styles.submitBtn}
                        onClick={submit}
                        disabled={!file}
                    >
                        Add
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
                                    {serverProcessing
                                        ? `Any video · up to ${MAX_HIGHLIGHT_SECONDS}s`
                                        : `MP4, MOV or WebM · up to ${MAX_HIGHLIGHT_SECONDS}s · under ${MAX_HIGHLIGHT_MB} MB`}
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

                            {submitError && (
                                <p className={styles.error} role="alert">
                                    <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                                    {submitError}
                                </p>
                            )}
                        </>
                    )}

                    <input
                        ref={inputRef}
                        type="file"
                        // `video/*` when the server converts what the phone
                        // cannot; MP4/MOV/WebM by name otherwise.
                        accept={videoAcceptFor(serverProcessing)}
                        className={styles.fileInput}
                        onChange={(e) => {
                            const picked = e.target.files?.[0]
                            // Reset first so re-picking the same file still fires.
                            e.target.value = ""
                            if (picked) void pickFile(picked)
                        }}
                    />
                </div>
            </div>
        </div>,
        document.body
    )
}
