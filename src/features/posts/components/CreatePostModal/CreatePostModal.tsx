"use client"

/**
 * CreatePostModal
 *
 * Opens as a modal on desktop, full-screen on mobile.
 * Content-only or content + media (images or single video).
 *
 * Media rules enforced:
 *  - Images only: max 10, each ≤ 5 MB
 *  - Video only:  1 file, ≤ 300 MB, ≤ 5 minutes
 *  - No mixing
 *  - No other file types
 *
 * Upload flow: compress (images) → XHR with progress → POST /posts/create
 */

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useCreatePost, useMyPostSports } from "@/features/posts/hooks/usePostMutations"
import {
    validateMediaFiles,
    uploadMediaFile,
    MAX_IMAGES,
    MAX_IMAGE_MB,
    MAX_VIDEO_MB,
    type MediaUploadResult,
} from "@/features/posts/services/postUpload.service"
import type { PostVisibility } from "@/features/posts/services/posts.api"
import styles from "./CreatePostModal.module.css"

// ── Types ─────────────────────────────────────────────────────

type FileEntry = {
    id: string          // local uuid for key
    file: File
    preview: string          // object URL
    isVideo: boolean
    uploaded: MediaUploadResult | null
    progress: number          // 0–100
    error: string | null
    status: "idle" | "uploading" | "done" | "error"
}

// ── Helpers ───────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uid() {
    return Math.random().toString(36).slice(2)
}

// ── Media preview grid ────────────────────────────────────────

function MediaPreview({
    entries,
    onRemove,
}: {
    entries: FileEntry[]
    onRemove: (id: string) => void
}) {
    if (entries.length === 0) return null
    const count = entries.length

    return (
        <div className={`${styles.mediaGrid} ${styles[`mediaGrid${Math.min(count, 4)}`]}`}>
            {entries.map((entry, idx) => {
                // Show max 4 tiles; last tile shows "+N more" overlay
                if (idx >= 4) return null
                const isOverflow = idx === 3 && count > 4

                return (
                    <div key={entry.id} className={`${styles.mediaTile} ${entry.isVideo ? styles.mediaTileVideo : ""}`}>
                        {entry.isVideo ? (
                            <video
                                src={entry.preview}
                                className={styles.mediaImg}
                                muted
                                playsInline
                                preload="metadata"
                            />
                        ) : (
                            <img src={entry.preview} className={styles.mediaImg} alt="" />
                        )}

                        {/* Upload progress overlay */}
                        {entry.status === "uploading" && (
                            <div className={styles.uploadOverlay}>
                                <div className={styles.uploadProgressRing}>
                                    <svg viewBox="0 0 36 36" className={styles.progressSvg}>
                                        <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                                        <circle
                                            cx="18" cy="18" r="14"
                                            fill="none"
                                            stroke="var(--color-brand)"
                                            strokeWidth="3"
                                            strokeDasharray={`${entry.progress * 0.879} 87.9`}
                                            strokeLinecap="round"
                                            transform="rotate(-90 18 18)"
                                        />
                                    </svg>
                                    <span className={styles.progressPct}>{entry.progress}%</span>
                                </div>
                                <span className={styles.uploadSize}>{fmtBytes(entry.file.size)}</span>
                            </div>
                        )}

                        {entry.status === "done" && (
                            <div className={styles.doneOverlay}>
                                <Icon icon="mdi:check-circle" width={20} height={20} />
                            </div>
                        )}

                        {entry.status === "error" && (
                            <div className={styles.errorOverlay}>
                                <Icon icon="mdi:alert-circle" width={20} height={20} />
                            </div>
                        )}

                        {/* Video play icon */}
                        {entry.isVideo && entry.status === "idle" && (
                            <div className={styles.videoPlayIcon}>
                                <Icon icon="mdi:play-circle-outline" width={36} height={36} />
                            </div>
                        )}

                        {/* Overflow indicator */}
                        {isOverflow && (
                            <div className={styles.overflowTile}>+{count - 3}</div>
                        )}

                        {/* Remove button (only when not uploading) */}
                        {entry.status !== "uploading" && (
                            <button
                                className={styles.removeTileBtn}
                                onClick={() => onRemove(entry.id)}
                                type="button"
                                aria-label="Remove media"
                            >
                                <Icon icon="mdi:close" width={14} height={14} />
                            </button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Visibility selector ───────────────────────────────────────

function VisibilityBtn({
    value,
    onChange,
}: {
    value: PostVisibility
    onChange: (v: PostVisibility) => void
}) {
    const icon = value === "public" ? "mdi:earth" : "mdi:account-group-outline"
    const label = value === "public" ? "Public" : "Followers"
    return (
        <button
            type="button"
            className={styles.visibilityBtn}
            onClick={() => onChange(value === "public" ? "followers" : "public")}
            aria-label={`Visibility: ${label}`}
        >
            <Icon icon={icon} width={14} height={14} />
            {label}
        </button>
    )
}

// ── Main component ────────────────────────────────────────────

interface CreatePostModalProps {
    username: string
    userAvatarUrl?: string
    userInitials?: string
    onClose: () => void
}

export default function CreatePostModal({
    username,
    userAvatarUrl,
    userInitials,
    onClose,
}: CreatePostModalProps) {
    const router = useRouter()
    const createPost = useCreatePost()
    const { data: mySports } = useMyPostSports()

    // ── Form state ────────────────────────────────────────────────
    const [content, setContent] = useState("")
    const [visibility, setVisibility] = useState<PostVisibility>("public")
    const [sportId, setSportId] = useState<string>("")
    const [entries, setEntries] = useState<FileEntry[]>([])
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── Media type derived state ──────────────────────────────────
    const hasVideo = entries.some((e) => e.isVideo)
    const hasImages = entries.some((e) => !e.isVideo)
    const canAddMore =
        !hasVideo &&
        entries.length < MAX_IMAGES &&
        !isSubmitting

    // ── Auto-resize textarea ──────────────────────────────────────
    const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value)
        const ta = e.target
        ta.style.height = "auto"
        ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`
    }

    // ── File selection ────────────────────────────────────────────
    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? [])
            if (!files.length) return
            e.target.value = ""
            setSubmitError(null)

            const combined = [...entries.map((en) => en.file), ...files]
            const err = validateMediaFiles(combined)
            if (err) { setSubmitError(err); return }

            const newEntries: FileEntry[] = files.map((f) => ({
                id: uid(),
                file: f,
                preview: URL.createObjectURL(f),
                isVideo: f.type.startsWith("video/"),
                uploaded: null,
                progress: 0,
                error: null,
                status: "idle",
            }))

            setEntries((prev) => [...prev, ...newEntries])
        },
        [entries]
    )

    const removeEntry = (id: string) => {
        setEntries((prev) => {
            const entry = prev.find((e) => e.id === id)
            if (entry) URL.revokeObjectURL(entry.preview)
            return prev.filter((e) => e.id !== id)
        })
    }

    // ── Submit ────────────────────────────────────────────────────
    const handleSubmit = async () => {
        setSubmitError(null)

        // Validate content
        const trimmed = content.trim()
        if (trimmed.length < 3) {
            setSubmitError("Post content must be at least 3 characters.")
            textareaRef.current?.focus()
            return
        }

        setIsSubmitting(true)

        try {
            let uploadedMedia: MediaUploadResult[] = []

            if (entries.length > 0) {
                setEntries((prev) => prev.map((e) => ({ ...e, status: "uploading", progress: 0 })))

                const mediaFiles = entries.map((e) => e.file)

                try {
                    uploadedMedia = await uploadMediaFile(
                        mediaFiles,
                        (i, loaded, total) => {
                            const pct = Math.round((loaded / total) * 100)
                            setEntries((prev) =>
                                prev.map((e, idx) => (idx === i ? { ...e, progress: pct } : e))
                            )
                        }
                    )

                    setEntries((prev) =>
                        prev.map((e, idx) => ({ ...e, status: "done", uploaded: uploadedMedia[idx], progress: 100 }))
                    )
                } catch (uploadErr: unknown) {
                    const msg = uploadErr instanceof Error ? uploadErr.message : "Upload failed"
                    setEntries((prev) => prev.map((e) => ({ ...e, status: "error", error: msg })))
                    throw new Error(msg)
                }
            }

            // Create post
            await createPost.mutateAsync({
                content: trimmed,
                post_type: "normal",
                visibility,
                sport_id: sportId || undefined,
                media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
            })

            // Success — redirect
            onClose()
            router.push(`/profile/${username}/posts`)
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Something went wrong. Please try again."
            setSubmitError(msg)
            setIsSubmitting(false)
        }
    }

    // ── Content char helpers ──────────────────────────────────────
    const contentLen = content.length
    const charWarning = contentLen > 2800

    const allUploaded = entries.every((e) => e.status === "idle" || e.status === "done")
    const canSubmit = content.trim().length >= 3 && !isSubmitting

    return (
        <div
            className={styles.backdrop}
            onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose() }}
            role="dialog"
            aria-modal="true"
            aria-label="Create post"
        >
            <div className={styles.modal}>

                {/* ── Header ── */}
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>Create Post</h2>
                    <button
                        className={styles.closeBtn}
                        onClick={onClose}
                        disabled={isSubmitting}
                        type="button"
                        aria-label="Close"
                    >
                        <Icon icon="mdi:close" width={20} height={20} />
                    </button>
                </div>

                {/* ── Scrollable body ── */}
                <div className={styles.body}>

                    {/* Author row */}
                    <div className={styles.authorRow}>
                        <Avatar
                            src={userAvatarUrl}
                            initials={userInitials}
                            size="md"
                        />
                        <div className={styles.authorMeta}>
                            <span className={styles.authorName}>@{username}</span>
                            <VisibilityBtn value={visibility} onChange={setVisibility} />
                        </div>
                    </div>

                    {/* Content textarea */}
                    <textarea
                        ref={textareaRef}
                        className={styles.contentTextarea}
                        placeholder="What's on your mind? Share highlights, achievements, or updates…"
                        value={content}
                        onChange={handleTextareaInput}
                        rows={4}
                        maxLength={3000}
                        disabled={isSubmitting}
                        aria-label="Post content"
                    />

                    {/* Char count — only show near limit */}
                    {charWarning && (
                        <div className={`${styles.charCount} ${contentLen > 2950 ? styles.charCountDanger : ""}`}>
                            {3000 - contentLen} characters remaining
                        </div>
                    )}

                    {/* Media preview */}
                    <MediaPreview entries={entries} onRemove={removeEntry} />

                    {/* Upload errors per file */}
                    {entries.some((e) => e.status === "error") && (
                        <div className={styles.uploadErrors}>
                            {entries.filter((e) => e.status === "error").map((e) => (
                                <p key={e.id} className={styles.uploadErrorItem}>
                                    <Icon icon="mdi:alert-circle-outline" width={13} height={13} />
                                    {e.file.name}: {e.error}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Global submit error */}
                    {submitError && (
                        <p className={styles.submitError} role="alert">
                            <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                            {submitError}
                        </p>
                    )}

                </div>

                {/* ── Toolbar + submit ── */}
                <div className={styles.footer}>

                    {/* Media add buttons */}
                    <div className={styles.footerTools}>
                        {/* Image add */}
                        <button
                            type="button"
                            className={`${styles.toolBtn} ${hasVideo || isSubmitting ? styles.toolBtnDisabled : ""}`}
                            onClick={() => {
                                if (!canAddMore && !hasVideo) return
                                if (hasVideo) return
                                fileInputRef.current?.click()
                            }}
                            disabled={hasVideo || isSubmitting}
                            aria-label="Add images"
                            title={`Add images (max ${MAX_IMAGES}, ${MAX_IMAGE_MB}MB each)`}
                        >
                            <Icon icon="mdi:image-plus-outline" width={22} height={22} />
                            {hasImages && <span className={styles.toolBtnCount}>{entries.length}</span>}
                        </button>

                        {/* Video add */}
                        <button
                            type="button"
                            className={`${styles.toolBtn} ${(hasImages || hasVideo || isSubmitting) ? styles.toolBtnDisabled : ""}`}
                            onClick={() => {
                                if (hasImages || hasVideo || isSubmitting) return
                                fileInputRef.current?.click()
                            }}
                            disabled={hasImages || hasVideo || isSubmitting}
                            aria-label="Add video"
                            title={`Add video (max ${MAX_VIDEO_MB}MB, 5 minutes)`}
                        >
                            <Icon icon="mdi:video-plus-outline" width={22} height={22} />
                        </button>

                        {/* Hint text */}
                        {entries.length > 0 && (
                            <span className={styles.mediaHint}>
                                {hasVideo
                                    ? "1 video"
                                    : `${entries.length}/${MAX_IMAGES} images`}
                            </span>
                        )}
                    </div>

                    {/* Sport tag + post button */}
                    <div className={styles.footerRight}>
                        {/* Sport selector */}
                        {mySports && mySports.length > 0 && (
                            <div className={styles.sportSelectWrap}>
                                <Icon icon="mdi:trophy-outline" width={14} height={14} className={styles.sportSelectIcon} />
                                <select
                                    className={styles.sportSelect}
                                    value={sportId}
                                    onChange={(e) => setSportId(e.target.value)}
                                    disabled={isSubmitting}
                                    aria-label="Tag a sport"
                                >
                                    <option value="">Tag sport</option>
                                    {mySports.map((ms) => (
                                        <option key={ms.sport.id} value={ms.sport.id}>
                                            {ms.sport.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Post button */}
                        <button
                            type="button"
                            className={styles.postBtn}
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            aria-busy={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className={styles.spinner} aria-hidden="true" />
                                    {entries.length > 0 ? "Uploading…" : "Posting…"}
                                </>
                            ) : (
                                "Post"
                            )}
                        </button>
                    </div>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple={!hasVideo}
                    accept={hasVideo ? "video/*" : "image/*,video/*"}
                    onChange={handleFileChange}
                />

            </div>
        </div>
    )
}