"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "../PostLocationPicker/PostLocationPicker"
import { useCreatePost, useMyPostSports } from "@/features/posts/hooks/usePostMutations"
import {
  validateMediaFiles,
  uploadMediaFile,
  MAX_IMAGES,
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
} from "@/features/posts/services/postUpload.service"
import type { PostVisibility, PostMediaPayload, PostLocation } from "@/features/posts/services/posts.api"
import type { MapboxPlace } from "@/shared/services/mapbox.service"
import styles from "./CreatePostModal.module.css"

// ── Types ─────────────────────────────────────────────────────

type FileEntry = {
  id:       string
  file:     File
  preview:  string
  isVideo:  boolean
  progress: number
  status:   "idle" | "uploading" | "done" | "error"
  error:    string | null
  result:   PostMediaPayload | null
}

type SubmitPhase = "idle" | "uploading" | "posting" | "done"

function uid() { return Math.random().toString(36).slice(2, 10) }
function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// ── Visibility toggle ─────────────────────────────────────────

function VisibilityBtn({ value, onChange }: {
  value: PostVisibility
  onChange: (v: PostVisibility) => void
}) {
  return (
    <button
      type="button"
      className={styles.badgeBtn}
      onClick={() => onChange(value === "public" ? "followers" : "public")}
      aria-label={`Visibility: ${value}`}
    >
      <Icon icon={value === "public" ? "mdi:earth" : "mdi:account-group-outline"} width={13} height={13} />
      {value === "public" ? "Public" : "Followers"}
    </button>
  )
}

// ── Media carousel preview ────────────────────────────────────

function MediaCarouselPreview({ entries, onRemove, disabled }: {
  entries: FileEntry[]
  onRemove: (id: string) => void
  disabled: boolean
}) {
  const [idx, setIdx] = useState(0)
  const touchStartX   = useRef(0)

  useEffect(() => {
    if (idx >= entries.length && entries.length > 0) setIdx(entries.length - 1)
  }, [entries.length, idx])

  if (entries.length === 0) return null
  const total   = entries.length
  const current = entries[idx]

  const prev = () => setIdx((i) => Math.max(0, i - 1))
  const next = () => setIdx((i) => Math.min(total - 1, i + 1))

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev()
  }

  return (
    <div className={styles.previewCarousel}>
      <div className={styles.previewSlide} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {current.isVideo ? (
          <video key={current.id} src={current.preview} className={styles.previewMedia} controls playsInline preload="metadata" />
        ) : (
          <img key={current.id} src={current.preview} className={styles.previewMedia} alt={`Preview ${idx + 1}`} />
        )}

        {current.status === "uploading" && (
          <div className={styles.previewUploadOverlay}>
            <div className={styles.ringWrap}>
              <svg viewBox="0 0 44 44" className={styles.ringSvg}>
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5"/>
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-brand)" strokeWidth="3.5"
                  strokeDasharray={`${current.progress * 1.131} 113.1`} strokeLinecap="round" transform="rotate(-90 22 22)" />
              </svg>
              <span className={styles.ringPct}>{current.progress}%</span>
            </div>
            <span className={styles.ringSize}>{fmtBytes(current.file.size)}</span>
          </div>
        )}

        {current.status === "done" && (
          <div className={styles.previewDoneOverlay}>
            <span className={styles.doneTick}><Icon icon="mdi:check-circle" width={28} height={28} /></span>
          </div>
        )}

        {current.status === "error" && (
          <div className={styles.previewErrorOverlay}>
            <Icon icon="mdi:alert-circle" width={24} height={24} />
            <span className={styles.previewErrorText}>{current.error}</span>
          </div>
        )}

        {!disabled && (
          <button className={styles.previewRemoveBtn} onClick={() => { onRemove(current.id); if (idx > 0 && idx === total - 1) setIdx(idx - 1) }}
            type="button" aria-label="Remove">
            <Icon icon="mdi:close" width={14} height={14} />
          </button>
        )}

        {current.isVideo && current.status === "idle" && (
          <div className={styles.previewVideoBadge}>
            <Icon icon="mdi:play-circle-outline" width={14} height={14} /> Video
          </div>
        )}

        {total > 1 && <div className={styles.previewCounter}>{idx + 1}/{total}</div>}
      </div>

      {total > 1 && idx > 0 && (
        <button className={`${styles.previewNav} ${styles.previewNavPrev}`} onClick={prev} type="button" aria-label="Previous">
          <Icon icon="mdi:chevron-left" width={18} height={18} />
        </button>
      )}
      {total > 1 && idx < total - 1 && (
        <button className={`${styles.previewNav} ${styles.previewNavNext}`} onClick={next} type="button" aria-label="Next">
          <Icon icon="mdi:chevron-right" width={18} height={18} />
        </button>
      )}

      {total > 1 && (
        <div className={styles.previewThumbRow}>
          {entries.map((e, i) => (
            <button key={e.id} className={`${styles.previewThumb} ${i === idx ? styles.previewThumbActive : ""}`}
              onClick={() => setIdx(i)} type="button" aria-label={`Go to ${i + 1}`}>
              {e.isVideo ? (
                <div className={styles.previewThumbVideoIcon}><Icon icon="mdi:play" width={14} height={14} /></div>
              ) : (
                <img src={e.preview} className={styles.previewThumbImg} alt="" />
              )}
              {e.status === "done" && <span className={styles.thumbDone}><Icon icon="mdi:check" width={10} height={10} /></span>}
              {e.status === "uploading" && <span className={styles.thumbProgress} style={{ "--pct": `${e.progress}%` } as React.CSSProperties} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Upload progress section ───────────────────────────────────

function UploadProgressSection({ entries, phase, onDone }: {
  entries: FileEntry[]
  phase:   SubmitPhase
  onDone:  () => void
}) {
  const total      = entries.length
  const doneCount  = entries.filter(e => e.status === "done").length
  const overallPct = total === 0 ? 100 : Math.round(entries.reduce((s, e) => s + e.progress, 0) / total)
  const isPosting  = phase === "posting"
  const isDone     = phase === "done"

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onDone, 1800)
      return () => clearTimeout(t)
    }
  }, [isDone, onDone])

  return (
    <div className={`${styles.uploadSection} ${isDone ? styles.uploadSectionDone : ""}`}>
      {isDone ? (
        <div className={styles.uploadDoneState}>
          <span className={styles.uploadBigTick}><Icon icon="mdi:check-circle" width={40} height={40} /></span>
          <span className={styles.uploadDoneLabel}>Posted!</span>
        </div>
      ) : (
        <>
          <div className={styles.uploadHeader}>
            <span className={styles.uploadLabel}>
              {isPosting ? "Publishing…" : total === 0 ? "Publishing…" : `Uploading ${doneCount}/${total} file${total > 1 ? "s" : ""}`}
            </span>
            <span className={styles.uploadPct}>{isPosting ? "" : `${overallPct}%`}</span>
          </div>
          <div className={styles.overallBarWrap}>
            <div className={styles.overallBar} style={{ width: isPosting ? "100%" : `${overallPct}%` }} />
          </div>
          {total > 1 && !isPosting && (
            <div className={styles.fileRows}>
              {entries.map((e) => (
                <div key={e.id} className={styles.fileRow}>
                  <div className={styles.fileRowThumb}>
                    {e.isVideo ? <Icon icon="mdi:video-outline" width={14} height={14} /> : <img src={e.preview} className={styles.fileRowThumbImg} alt="" />}
                  </div>
                  <div className={styles.fileRowInfo}>
                    <span className={styles.fileRowName}>{e.file.name.slice(0, 24)}</span>
                    <div className={styles.fileRowBar}><div className={styles.fileRowBarFill} style={{ width: `${e.progress}%` }} /></div>
                  </div>
                  <span className={styles.fileRowStatus}>
                    {e.status === "done" ? <Icon icon="mdi:check-circle" width={16} height={16} className={styles.fileRowDone} />
                      : e.status === "error" ? <Icon icon="mdi:alert-circle" width={16} height={16} className={styles.fileRowError} />
                      : <span className={styles.fileRowPct}>{e.progress}%</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {total === 1 && <div className={styles.singleFileHint}>{fmtBytes(entries[0].file.size)} · {overallPct}%</div>}
        </>
      )}
    </div>
  )
}

// ── Main CreatePostModal ──────────────────────────────────────

interface CreatePostModalProps {
  username:       string
  userAvatarUrl?: string
  userInitials?:  string
  onClose:        () => void
}

export default function CreatePostModal({
  username, userAvatarUrl, userInitials, onClose,
}: CreatePostModalProps) {
  const router     = useRouter()
  const createPost = useCreatePost()
  const { data: mySports } = useMyPostSports()

  // Compose state
  const [content,      setContent]      = useState("")
  const [visibility,   setVisibility]   = useState<PostVisibility>("public")
  const [sportId,      setSportId]      = useState("")
  const [entries,      setEntries]      = useState<FileEntry[]>([])
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [phase,        setPhase]        = useState<SubmitPhase>("idle")

  // Location state — managed outside any form library
  const [postLocation,  setPostLocation]  = useState<MapboxPlace | null>(null)
  const [locationOpen,  setLocationOpen]  = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const bodyRef      = useRef<HTMLDivElement>(null)

  const isSubmitting = phase !== "idle"
  const hasVideo     = entries.some(e => e.isVideo)
  const hasImages    = entries.some(e => !e.isVideo)
  const composing    = phase === "idle"

  // ── Auto-resize textarea ──────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`
  }

  // ── File selection ────────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (!files.length) return
    setSubmitError(null)

    const combined = [...entries.map(en => en.file), ...files]
    const err = validateMediaFiles(combined)
    if (err) { setSubmitError(err); return }

    const newEntries: FileEntry[] = files.map(f => ({
      id:       uid(),
      file:     f,
      preview:  URL.createObjectURL(f),
      isVideo:  f.type.startsWith("video/"),
      progress: 0,
      status:   "idle",
      error:    null,
      result:   null,
    }))
    setEntries(prev => [...prev, ...newEntries])
  }, [entries])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => {
      const e = prev.find(x => x.id === id)
      if (e) URL.revokeObjectURL(e.preview)
      return prev.filter(x => x.id !== id)
    })
  }, [])

  // ── Handle location select — close picker after pick ──────────
  const handleLocationChange = (place: MapboxPlace | null) => {
    setPostLocation(place)
    if (place) setLocationOpen(false)
  }

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError(null)
    const trimmed = content.trim()
    if (trimmed.length < 3) {
      setSubmitError("Post content must be at least 3 characters.")
      textareaRef.current?.focus()
      return
    }

    let uploadedMedia: PostMediaPayload[] = []

    if (entries.length > 0) {
      setPhase("uploading")
      setEntries(prev => prev.map(e => ({ ...e, status: "uploading", progress: 0 })))
      try {
        const results = await uploadMediaFile(
          entries.map(e => e.file),
          (fileIndex, loaded, total) => {
            const pct = Math.round((loaded / total) * 100)
            setEntries(prev => prev.map((e, i) => i === fileIndex ? { ...e, progress: pct } : e))
          }
        )
        for (let i = 0; i < results.length; i++) {
          setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, status: "done", progress: 100, result: results[i] } : e))
          if (i < results.length - 1) await new Promise(r => setTimeout(r, 120))
        }
        uploadedMedia = results
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed"
        setEntries(prev => prev.map(e => e.status !== "done" ? { ...e, status: "error", error: msg } : e))
        setSubmitError(msg)
        setPhase("idle")
        return
      }
    } else {
      setPhase("uploading")
    }

    setPhase("posting")

    // Build location payload if selected
    const locationPayload: PostLocation | undefined = postLocation ? {
      name:         postLocation.name,
      type:         postLocation.place_type,
      city:         postLocation.place_type === "place" ? postLocation.name : undefined,
      state:        postLocation.state || undefined,
      country_code: postLocation.country_code,
      latitude:     postLocation.latitude,
      longitude:    postLocation.longitude,
      external_id:  postLocation.external_id,
    } : undefined

    try {
      await createPost.mutateAsync({
        content:   trimmed,
        post_type: "normal",
        visibility,
        sport_id:  sportId || undefined,
        media:     uploadedMedia.length > 0 ? uploadedMedia : undefined,
        location:  locationPayload,
      })
      setPhase("done")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to post. Try again."
      setSubmitError(msg)
      setPhase("idle")
    }
  }

  const handleDoneRedirect = useCallback(() => {
    onClose()
    router.push(`/profile/${username}/posts`)
  }, [onClose, router, username])

  const contentLen  = content.length
  const charWarning = contentLen > 2800
  const canSubmit   = content.trim().length >= 3 && !isSubmitting

  return (
    <div
      className={styles.backdrop}
      onClick={e => { if (e.target === e.currentTarget && composing) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Create Post</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={isSubmitting} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Scrollable compose body ── */}
        <div className={styles.body} ref={bodyRef}>

          {/* Author row */}
          <div className={styles.authorRow}>
            <Avatar src={userAvatarUrl} initials={userInitials} size="md" />
            <div className={styles.authorMeta}>
              <span className={styles.authorName}>@{username}</span>
              {composing && (
                <div className={styles.authorBadges}>
                  <VisibilityBtn value={visibility} onChange={setVisibility} />
                  
                  {/* Sport Select */}
                  {mySports && mySports.length > 0 && (
                    <div className={styles.badgeSelectWrap}>
                      <Icon icon="mdi:trophy-outline" width={12} height={12} className={styles.badgeSelectIcon} />
                      <select className={styles.badgeSelect} value={sportId}
                        onChange={e => setSportId(e.target.value)} aria-label="Tag a sport">
                        <option value="">SELECT SPORT</option>
                        {mySports.map(ms => (
                          <option key={ms.sport.id} value={ms.sport.id}>{ms.sport.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Location Toggle / Pill */}
                  {postLocation ? (
                    <div className={styles.badgePill}>
                      <Icon icon="mdi:map-marker" width={12} height={12} />
                      <span className={styles.badgePillText}>{postLocation.name}</span>
                      <button
                        type="button"
                        className={styles.badgePillClose}
                        onClick={() => setPostLocation(null)}
                        aria-label="Remove location"
                      >
                        <Icon icon="mdi:close" width={10} height={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.badgeBtn} ${locationOpen ? styles.badgeBtnActive : ""}`}
                      onClick={() => setLocationOpen(v => !v)}
                      aria-label="Add location"
                    >
                      <Icon icon="mdi:map-marker-plus-outline" width={13} height={13} />
                      LOCATION
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Content textarea */}
          <textarea
            ref={textareaRef}
            className={styles.contentTextarea}
            placeholder="What's on your mind? Share highlights, achievements, or updates…"
            value={content}
            onChange={handleTextChange}
            rows={3}
            maxLength={3000}
            disabled={isSubmitting}
            aria-label="Post content"
          />

          {/* Char count */}
          {charWarning && (
            <p className={`${styles.charCount} ${contentLen > 2950 ? styles.charCountDanger : ""}`}>
              {3000 - contentLen} remaining
            </p>
          )}

          {/* Location picker — inline in body, shown when toggled */}
          {locationOpen && composing && (
            <div className={styles.locationPickerWrap}>
              <PostLocationPicker
                value={postLocation}
                onChange={handleLocationChange}
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Media carousel */}
          {entries.length > 0 && (
            <MediaCarouselPreview entries={entries} onRemove={removeEntry} disabled={isSubmitting} />
          )}

          {/* Global error */}
          {submitError && (
            <p className={styles.submitError} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
              {submitError}
            </p>
          )}

        </div>

        {/* ── Upload / posting progress section ── */}
        {phase !== "idle" && (
          <UploadProgressSection entries={entries} phase={phase} onDone={handleDoneRedirect} />
        )}

        {/* ── Footer toolbar ── */}
        {composing && (
          <div className={styles.footer}>
            <div className={styles.footerTools}>

              {/* Add images */}
              <button type="button" className={styles.toolBtn}
                onClick={() => { if (!hasVideo) fileInputRef.current?.click() }}
                disabled={hasVideo} aria-label="Add images"
                title={`Add images (max ${MAX_IMAGES}, ${MAX_IMAGE_MB}MB each)`}>
                <Icon icon="mdi:image-plus-outline" width={22} height={22} />
                {hasImages && <span className={styles.toolCount}>{entries.length}</span>}
              </button>

              {/* Add video */}
              <button type="button" className={styles.toolBtn}
                onClick={() => { if (!hasImages && !hasVideo) fileInputRef.current?.click() }}
                disabled={hasImages || hasVideo} aria-label="Add video"
                title={`Add video (max ${MAX_VIDEO_MB}MB, 5 min)`}>
                <Icon icon="mdi:video-plus-outline" width={22} height={22} />
              </button>

              {/* Media hints */}
              {entries.length > 0 && (
                <span className={styles.mediaHint}>
                  {hasVideo ? "1 video" : `${entries.length}/${MAX_IMAGES} photos`}
                </span>
              )}
            </div>

            <div className={styles.footerRight}>
              {/* Post button */}
              <button type="button" className={styles.postBtn} onClick={handleSubmit} disabled={!canSubmit}>
                Post
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple={!hasVideo && !entries.some(e => e.isVideo)}
          accept="image/*,video/*"
          onChange={handleFileChange}
        />

      </div>
    </div>
  )
}