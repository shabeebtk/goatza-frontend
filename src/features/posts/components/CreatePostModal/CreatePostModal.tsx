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
import type { PlaceResult } from "@/shared/services/places.service"
import { useProfileBias } from "@/features/profile/hooks/useProfileBias"
import { VIDEO_ACCEPT } from "@/shared/constants/media"
import { OPTIMIZING_LABEL, isVideoAudioLostError } from "@/shared/services/videoEncode"
import { UPLOAD_CANCELLED } from "@/shared/services/mediaUpload"
import { getApiErrorMessage, isUploadCancellation } from "@/shared/services/apiError"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import { getPostAspectRatio, POST_RATIO_FALLBACK } from "@/features/posts/utils/media"
import PostImageCropper, { type CropState } from "../PostImageCropper/PostImageCropper"
import MentionAutocomplete from "../MentionAutocomplete/MentionAutocomplete"
import { useMentionAutocomplete } from "../MentionAutocomplete/useMentionAutocomplete"
import Select from "@/shared/components/ui/Select/Select"
import styles from "./CreatePostModal.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"

// ── Types ─────────────────────────────────────────────────────

type FileEntry = {
  id:       string
  file:     File          // current (possibly cropped) file that gets uploaded
  originalFile: File      // untouched source — re-cropping always starts here
  preview:  string
  isVideo:  boolean
  progress: number
  status:   "idle" | "uploading" | "done" | "error"
  /** True while the browser is re-encoding this video, before any bytes move. */
  optimizing?: boolean
  error:    string | null
  result:   PostMediaPayload | null
  crop?:    CropState     // saved reposition so re-opening the cropper resumes
  zoom?:    number
}

type SubmitPhase = "idle" | "uploading" | "posting" | "done"

function uid() { return Math.random().toString(36).slice(2, 10) }
function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// Measure a local file's clamped display ratio (same clamp the feed uses), so
// the preview shows exactly how the post will be cropped once published.
function measureRatio(entry: FileEntry): Promise<number> {
  return new Promise((resolve) => {
    if (entry.isVideo) {
      const v = document.createElement("video")
      v.preload = "metadata"
      v.onloadedmetadata = () =>
        resolve(getPostAspectRatio([{ width: v.videoWidth, height: v.videoHeight }]))
      v.onerror = () => resolve(POST_RATIO_FALLBACK)
      v.src = entry.preview
    } else {
      const img = new Image()
      img.onload = () =>
        resolve(getPostAspectRatio([{ width: img.naturalWidth, height: img.naturalHeight }]))
      img.onerror = () => resolve(POST_RATIO_FALLBACK)
      img.src = entry.preview
    }
  })
}

// ── Preview video — play/pause only, no native player chrome ──

function PreviewVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  return (
    <div className={styles.previewVideoWrap} onClick={toggle}>
      <video
        ref={ref}
        src={src}
        className={styles.previewMedia}
        playsInline
        preload="metadata"
        // No `controls` → no timeline, fullscreen, options menu or download.
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

function MediaCarouselPreview({ entries, onRemove, onCropEntry, disabled }: {
  entries: FileEntry[]
  onRemove: (id: string) => void
  onCropEntry: (id: string, file: File, crop: CropState, zoom: number) => void
  disabled: boolean
}) {
  // Clamped during render, not corrected afterwards in an effect.
  // `entries` shrinks when the author removes an item, and an index past the
  // end reads `undefined`. Doing it here means the broken frame is never
  // painted; the effect that used to fix it rendered it once first.
  const [rawIdx, setIdx] = useState(0)
  const idx = entries.length > 0 ? Math.min(rawIdx, entries.length - 1) : 0
  const touchStartX   = useRef(0)

  // Crop editor state — `cropSrc` is a temp object URL of the ORIGINAL image.
  const [cropId, setCropId]   = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  // The whole preview is sized by the FIRST item's clamped ratio — matching the
  // feed exactly, so what the author sees here is what gets posted (no surprise
  // crop after publishing).
  const [firstRatio, setFirstRatio] = useState(POST_RATIO_FALLBACK)
  const firstEntry = entries[0]

  useEffect(() => {
    if (!firstEntry) return
    let cancelled = false
    measureRatio(firstEntry).then((r) => { if (!cancelled) setFirstRatio(r) })
    return () => { cancelled = true }
  }, [firstEntry])

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

  // ── Crop editor ───────────────────────────────────────────────
  const cropEntry = cropId ? entries.find((e) => e.id === cropId) ?? null : null

  const openCropper = (entry: FileEntry) => {
    setCropSrc(URL.createObjectURL(entry.originalFile))
    setCropId(entry.id)
  }
  const closeCropper = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropId(null)
  }
  const applyCrop = (blob: Blob, crop: CropState, zoom: number) => {
    if (cropEntry) {
      const base = cropEntry.originalFile.name.replace(/\.[^.]+$/, "") || "photo"
      const file = new File([blob], `${base}.jpg`, { type: "image/jpeg" })
      onCropEntry(cropEntry.id, file, crop, zoom)
    }
    closeCropper()
  }

  return (
    <>
    <div className={styles.previewCarousel}>
      <div
        className={styles.previewSlide}
        style={{ aspectRatio: firstRatio }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {current.isVideo ? (
          <PreviewVideo key={current.id} src={current.preview} />
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

        {/* Adjust / crop — images only, while composing */}
        {!disabled && !current.isVideo && current.status === "idle" && (
          <button
            className={styles.previewCropBtn}
            onClick={() => openCropper(current)}
            type="button"
            aria-label="Adjust photo"
          >
            <Icon icon="mdi:crop" width={13} height={13} /> Adjust
          </button>
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

    {cropId && cropSrc && (
      <PostImageCropper
        src={cropSrc}
        aspect={firstRatio}
        initialCrop={cropEntry?.crop}
        initialZoom={cropEntry?.zoom}
        onCancel={closeCropper}
        onApply={applyCrop}
      />
    )}
    </>
  )
}

// ── Upload overlay ────────────────────────────────────────────

/** Circumference of the progress ring (r = 56). */
const RING_R = 56
const RING_C = 2 * Math.PI * RING_R

/**
 * Covers the composer from Post until the redirect: one ring for the whole
 * batch, the media dimmed behind it, and Cancel for as long as cancelling is
 * safe. Once the create-post request is in flight ("Publishing…") the post
 * cannot be un-sent, so Cancel goes with it.
 */
function UploadOverlay({ entries, phase, onCancel, onDone }: {
  entries:  FileEntry[]
  phase:    SubmitPhase
  onCancel: () => void
  onDone:   () => void
}) {
  const total      = entries.length
  const doneCount  = entries.filter(e => e.status === "done").length
  const overallPct = total === 0 ? 100 : Math.round(entries.reduce((s, e) => s + e.progress, 0) / total)
  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const isPosting  = phase === "posting"
  const isDone     = phase === "done"
  // A video spends the first 70% of its bar being encoded, which on a phone is
  // the slower half — saying "Uploading" through it reads as a stall.
  const isOptimizing = entries.some((e) => e.optimizing)
  const canCancel    = phase === "uploading"
  const first        = entries[0]

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onDone, 1800)
      return () => clearTimeout(t)
    }
  }, [isDone, onDone])

  const label = isDone ? "Posted!"
    : isPosting || total === 0 ? "Publishing…"
    : isOptimizing ? OPTIMIZING_LABEL
    : `Uploading ${Math.min(doneCount + 1, total)}/${total}`

  const pct = isPosting || isDone ? 100 : overallPct

  return (
    <div className={styles.uploadOverlay} role="status" aria-live="polite">
      {/* The post's own media, dimmed and softened, so the screen still reads
          as "your post" rather than a blank progress page. */}
      {first && (
        <div className={styles.uploadOverlayBg} aria-hidden="true">
          {first.isVideo ? (
            // `#t=0.001` makes Safari paint the first frame of a paused,
            // metadata-only video instead of leaving the box black.
            <video
              src={`${first.preview}#t=0.001`}
              className={styles.uploadOverlayBgMedia}
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
            />
          ) : (
            <img src={first.preview} className={styles.uploadOverlayBgMedia} alt="" />
          )}
        </div>
      )}

      <div className={styles.uploadOverlayContent}>
        <div className={`${styles.uploadRingWrap} ${isPosting ? styles.uploadRingIndeterminate : ""}`}>
          <svg viewBox="0 0 128 128" className={styles.uploadRingSvg} aria-hidden="true">
            <circle cx="64" cy="64" r={RING_R} fill="none" strokeWidth="6" className={styles.uploadRingTrack} />
            <circle
              cx="64" cy="64" r={RING_R} fill="none" strokeWidth="6" strokeLinecap="round"
              className={styles.uploadRingFill}
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct / 100)}
            />
          </svg>
          {isDone ? (
            <span className={styles.uploadOverlayDone}>
              <Icon icon="mdi:check-circle" width={56} height={56} />
            </span>
          ) : (
            <span className={styles.uploadRingPct}>{isPosting ? "" : `${overallPct}%`}</span>
          )}
        </div>

        <span className={styles.uploadOverlayLabel}>{label}</span>

        {!isDone && total > 0 && (
          <span className={styles.uploadOverlayMeta}>
            {total > 1 ? `${total} files · ` : ""}{fmtBytes(totalBytes)}
            {!isPosting ? ` · ${overallPct}%` : ""}
          </span>
        )}
      </div>

      {canCancel && (
        <button type="button" className={styles.uploadCancelBtn} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}

// ── Main CreatePostModal ──────────────────────────────────────

interface CreatePostModalProps {
  username:       string
  userAvatarUrl?: string
  userInitials?:  string
  displayName?:   string
  onClose:        () => void
}

export default function CreatePostModal({
  username, userAvatarUrl, userInitials, displayName, onClose,
}: CreatePostModalProps) {
  const router     = useRouter()
  const createPost = useCreatePost()
  const { data: mySports } = useMyPostSports()
  const { toPostsList } = useNavigation()
  const actorType = useAuthStore(s => s.actorType)

  // Compose state
  const [content,      setContent]      = useState("")
  const [visibility,   setVisibility]   = useState<PostVisibility>("public")
  const [sportId,      setSportId]      = useState("")
  const [entries,      setEntries]      = useState<FileEntry[]>([])
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [phase,        setPhase]        = useState<SubmitPhase>("idle")
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // The browser could not keep the video's sound: ask before posting it mute.
  const [confirmSilent,  setConfirmSilent]  = useState(false)
  // "Cancel upload?" — asked before an in-flight upload is thrown away.
  const [confirmCancel,  setConfirmCancel]  = useState(false)
  // The upload in flight, so Cancel (and unmount) can pull the plug on the
  // compressor, the encoder, the signature request and every PUT at once.
  const abortRef = useRef<AbortController | null>(null)

  // Location state — managed outside any form library
  const [postLocation,  setPostLocation]  = useState<PlaceResult | null>(null)
  const [locationOpen,  setLocationOpen]  = useState(false)
  // The actor's own coordinates, as a 50 km bias circle for place search.
  // Cache-only: never fetches, and null is a perfectly normal answer.
  const placeBias = useProfileBias()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const bodyRef      = useRef<HTMLDivElement>(null)

  const isSubmitting = phase !== "idle"
  const hasVideo     = entries.some(e => e.isVideo)
  const hasImages    = entries.some(e => !e.isVideo)
  const composing    = phase === "idle"

  // ── Unsaved-changes guard ─────────────────────────────────────
  const isDirty =
    content.trim() !== "" ||
    entries.length > 0 ||
    postLocation !== null ||
    sportId !== "" ||
    visibility !== "public"

  // Close, but confirm first if the user has started composing.
  const requestClose = () => {
    if (composing && isDirty) setConfirmDiscard(true)
    else onClose()
  }

  // ── Manage body scroll lock ───────────────────────────────────
  useBodyScrollLock()

  // ── Cancel an in-flight upload ────────────────────────────────
  // Aborts with the shared sentinel as the reason so every stage — including
  // browser-image-compression, which rethrows `signal.reason` — rejects with
  // the same cancellation the catch below stays silent on. The draft (text,
  // media, sport, location, visibility) is untouched: only the entries'
  // upload state goes back to idle.
  const cancelUpload = useCallback(() => {
    setConfirmCancel(false)
    const controller = abortRef.current
    abortRef.current = null
    controller?.abort(new Error(UPLOAD_CANCELLED))
    setEntries(prev => prev.map(e => ({ ...e, status: "idle", progress: 0, optimizing: false, error: null, result: null })))
    setSubmitError(null)
    setPhase("idle")
  }, [])

  // Leaving the screen mid-upload must not leave an encoder or an XHR running
  // for a composer that no longer exists.
  useEffect(() => () => {
    abortRef.current?.abort(new Error(UPLOAD_CANCELLED))
    abortRef.current = null
  }, [])

  // Esc while uploading asks to cancel (and closes that question again); it
  // never closes the modal. Once the post is being published there is nothing
  // left to cancel, so Esc does nothing.
  useEffect(() => {
    if (phase !== "uploading") return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setConfirmCancel(open => !open)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [phase])

  // ── Auto-resize textarea ──────────────────────────────────────
  const resizeTextarea = (ta: HTMLTextAreaElement) => {
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`
  }

  // ── @mention autocomplete ─────────────────────────────────────
  const mention = useMentionAutocomplete({
    value: content,
    textareaRef,
    disabled: isSubmitting,
    onChange: (next: string) => {
      setContent(next)
      const ta = textareaRef.current
      // Inserting a handle can push the text onto another line.
      if (ta) resizeTextarea(ta)
    },
  })

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    resizeTextarea(e.target)
    mention.syncCaret()
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
      id:           uid(),
      file:         f,
      originalFile: f,
      preview:      URL.createObjectURL(f),
      isVideo:      f.type.startsWith("video/"),
      progress:     0,
      status:       "idle",
      error:        null,
      result:       null,
    }))
    setEntries(prev => [...prev, ...newEntries])
  }, [entries])

  // ── Apply a crop — replace the entry's file, keep the original ─
  const handleCropEntry = useCallback((id: string, file: File, crop: CropState, zoom: number) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e
      URL.revokeObjectURL(e.preview)
      return { ...e, file, preview: URL.createObjectURL(file), crop, zoom }
    }))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => {
      const e = prev.find(x => x.id === id)
      if (e) URL.revokeObjectURL(e.preview)
      return prev.filter(x => x.id !== id)
    })
  }, [])

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (opts?: { allowSilentAudio?: boolean }) => {
    setSubmitError(null)
    const trimmed = content.trim()
    if (trimmed.length < 3) {
      setSubmitError("Post content must be at least 3 characters.")
      textareaRef.current?.focus()
      return
    }

    let uploadedMedia: PostMediaPayload[] = []

    if (entries.length > 0) {
      // One controller per attempt; a retry ("Post without sound") gets its own.
      abortRef.current?.abort(new Error(UPLOAD_CANCELLED))
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      setPhase("uploading")
      setEntries(prev => prev.map(e => ({ ...e, status: "uploading", progress: 0, error: null })))
      try {
        const results = await uploadMediaFile(
          entries.map(e => e.file),
          (fileIndex, loaded, total, uploadPhase) => {
            // A late progress event from a cancelled upload must not touch the
            // composer the cancel just put back.
            if (signal.aborted) return
            const pct = Math.round((loaded / total) * 100)
            setEntries(prev => prev.map((e, i) => i === fileIndex
              ? { ...e, progress: pct, optimizing: uploadPhase === "encoding" }
              : e))
          },
          { allowSilentAudio: opts?.allowSilentAudio, signal }
        )
        if (signal.aborted) return
        for (let i = 0; i < results.length; i++) {
          setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, status: "done", progress: 100, optimizing: false, result: results[i] } : e))
          if (i < results.length - 1) await new Promise(r => setTimeout(r, 120))
          if (signal.aborted) return
        }
        uploadedMedia = results
      } catch (err: unknown) {
        // The author cancelled: `cancelUpload` has already put the composer
        // back, and there is nothing to tell them.
        if (signal.aborted || isUploadCancellation(err)) return

        // Not a failure yet — a decision. Nothing was uploaded, so put the
        // composer back exactly as it was and ask; "Post without sound"
        // re-runs this with the author's permission.
        if (isVideoAudioLostError(err)) {
          setEntries(prev => prev.map(e => ({ ...e, status: "idle", progress: 0, optimizing: false, error: null })))
          setPhase("idle")
          setConfirmSilent(true)
          return
        }

        // The overlay goes away and the composer shows what went wrong — the
        // server's own words when it has some, the upload helpers' otherwise,
        // and never axios's "Request failed with status code …".
        const msg = getApiErrorMessage(err, "Couldn't upload your media. Please try again.")
        setEntries(prev => prev.map(e => e.status !== "done" ? { ...e, status: "error", optimizing: false, error: msg } : e))
        setSubmitError(msg)
        setPhase("idle")
        return
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    } else {
      setPhase("uploading")
    }

    setPhase("posting")

    // Build location payload if selected
    const locationPayload: PostLocation | undefined = postLocation ? {
      provider:     postLocation.provider,
      name:         postLocation.name,
      type:         postLocation.place_type,
      // The picker now resolves a real city for a venue, so prefer it and fall
      // back to the place name only when Google had no locality to give.
      city:         postLocation.city || postLocation.name,
      state:        postLocation.state || undefined,
      country:      postLocation.country || undefined,
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
      setSubmitError(getApiErrorMessage(err, "Couldn't publish your post. Please try again."))
      setPhase("idle")
    }
  }

  // Send the author to their own posts list. For an org actor this resolves to
  // the org-admin posts page; for a user it stays on the public profile.
  const postsListHref = toPostsList(username, actorType === "organization" ? "organization" : "user")
  const handleDoneRedirect = useCallback(() => {
    onClose()
    router.push(postsListHref)
  }, [onClose, router, postsListHref])

  const contentLen  = content.length
  const charWarning = contentLen > 2800
  const canSubmit   = content.trim().length >= 3 && !isSubmitting

  return (
    <div
      className={styles.backdrop}
      onClick={e => { if (e.target === e.currentTarget && composing) requestClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Create Post</h2>
          <button className={styles.closeBtn} onClick={requestClose} disabled={isSubmitting} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Scrollable compose body ── */}
        <div className={styles.body} ref={bodyRef}>

          {/* Author row */}
          <div className={styles.authorRow}>
            <Avatar src={userAvatarUrl} initials={userInitials} size="md" />
            <div className={styles.authorMeta}>
              <span className={styles.authorName}>
                {displayName ? `${displayName} ` : username}
              </span>
              {composing && (
                <div className={styles.authorBadges}>
                  <VisibilityBtn value={visibility} onChange={setVisibility} />
                  
                  {/* Sport Select */}
                  {mySports && mySports.length > 0 && (
                    <Select
                      className={styles.sportField}
                      size="sm"
                      aria-label="Tag a sport"
                      sheetTitle="Tag a sport"
                      placeholder="Select sport"
                      value={sportId}
                      onChange={setSportId}
                      options={mySports.map(ms => ({
                        value: ms.sport.id,
                        label: ms.sport.name,
                        icon: "mdi:trophy-outline",
                      }))}
                    />
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

          {/* Mention suggestions sit ABOVE the textarea — below it they end up
              under the media preview and off the bottom of the scrolled body
              the moment a photo or video is attached. */}
          <MentionAutocomplete
            open={mention.isOpen}
            options={mention.options}
            activeIndex={mention.activeIndex}
            onSelect={mention.select}
            onHover={mention.setActiveIndex}
          />

          {/* Content textarea */}
          <textarea
            ref={textareaRef}
            className={styles.contentTextarea}
            placeholder="What's on your mind? Share highlights, achievements, or updates…"
            value={content}
            onChange={handleTextChange}
            onKeyDown={(e) => mention.handleKeyDown(e)}
            onKeyUp={mention.syncCaret}
            onClick={mention.syncCaret}
            onBlur={mention.close}
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

          {/* Location — full-screen search, portalled above this modal.
              It closes itself on pick and on remove; the toolbar pill above
              keeps its own remove for when the screen isn't open. */}
          {locationOpen && composing && (
            <PostLocationPicker
              value={postLocation}
              onChange={setPostLocation}
              onClose={() => setLocationOpen(false)}
              disabled={isSubmitting}
              bias={placeBias}
            />
          )}

          {/* Media carousel */}
          {entries.length > 0 && (
            <MediaCarouselPreview
              entries={entries}
              onRemove={removeEntry}
              onCropEntry={handleCropEntry}
              disabled={isSubmitting}
            />
          )}

          {/* Global error */}
          {submitError && (
            <p className={styles.submitError} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
              {submitError}
            </p>
          )}

        </div>

        {/* ── Full-screen upload / publishing / posted overlay ── */}
        {phase !== "idle" && (
          <UploadOverlay
            entries={entries}
            phase={phase}
            onCancel={() => setConfirmCancel(true)}
            onDone={handleDoneRedirect}
          />
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
              <button type="button" className={styles.postBtn} onClick={() => handleSubmit()} disabled={!canSubmit}>
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
          // Videos are named explicitly, not `video/*`: validateMediaFiles
          // rejects anything outside MP4/MOV/WebM, so the picker shouldn't
          // offer files it is about to refuse.
          accept={`image/*,${VIDEO_ACCEPT}`}
          onChange={handleFileChange}
        />

      </div>

      {/* The sound cannot be kept on this browser: post mute, or not at all */}
      {confirmSilent && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmSilent(false)}>
          <div
            className={styles.confirmDialog}
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Post without sound"
          >
            <span className={`${styles.confirmIcon} ${styles.confirmIconWarn}`}>
              <Icon icon="mdi:volume-off" width={26} height={26} />
            </span>
            <h3 className={styles.confirmTitle}>Post without sound?</h3>
            <p className={styles.confirmText}>
              This browser can&rsquo;t keep the sound on this video. Try posting it from a computer, or update your phone&rsquo;s software.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmSilent(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmPrimaryBtn}
                onClick={() => { setConfirmSilent(false); void handleSubmit({ allowSilentAudio: true }) }}
              >
                Post without sound
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel the upload in flight — the draft stays */}
      {confirmCancel && phase === "uploading" && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmCancel(false)}>
          <div
            className={styles.confirmDialog}
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Cancel upload"
          >
            <span className={styles.confirmIcon}>
              <Icon icon="mdi:upload-off-outline" width={26} height={26} />
            </span>
            <h3 className={styles.confirmTitle}>Cancel upload?</h3>
            <p className={styles.confirmText}>
              Your post won&rsquo;t be shared.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmCancel(false)}>
                Keep uploading
              </button>
              <button type="button" className={styles.confirmDiscardBtn} onClick={cancelUpload}>
                Cancel upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard-changes confirmation */}
      {confirmDiscard && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDiscard(false)}>
          <div
            className={styles.confirmDialog}
            onClick={e => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label="Discard post"
          >
            <span className={styles.confirmIcon}>
              <Icon icon="mdi:alert-outline" width={26} height={26} />
            </span>
            <h3 className={styles.confirmTitle}>Discard this post?</h3>
            <p className={styles.confirmText}>
              What you&rsquo;ve written and added here hasn&rsquo;t been posted yet and will be lost.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancelBtn} onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </button>
              <button type="button" className={styles.confirmDiscardBtn} onClick={() => { setConfirmDiscard(false); onClose() }}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
