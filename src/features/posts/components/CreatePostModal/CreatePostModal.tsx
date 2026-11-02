"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "../PostLocationPicker/PostLocationPicker"
import { CLEAR_SPORT, sportOptions, usePostSports } from "@/features/posts/hooks/usePostSports"
import {
  validateMediaFiles,
  runPostUpload,
  MAX_IMAGES,
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
  MAX_VIDEO_SECONDS,
  VIDEO_TOO_LONG_MESSAGE,
  type PostDraft,
} from "@/features/posts/services/postUpload.service"
import type { PostVisibility, PostLocation } from "@/features/posts/services/posts.api"
import type { PlaceResult } from "@/shared/services/places.service"
import { useProfileBias } from "@/features/profile/hooks/useProfileBias"
import { videoAcceptFor } from "@/shared/constants/media"
import { OFFLINE_MESSAGE } from "@/shared/services/mediaUpload"
import { useMediaCapabilities } from "@/shared/services/mediaCapabilities"
import { checkVideoDuration } from "@/shared/services/videoPrep"
import { enqueueUpload } from "@/shared/upload/uploadQueue"
import {
  reopenPostComposer,
  type PostComposerDraft,
} from "@/features/posts/store/postComposer.store"
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
  crop?:    CropState     // saved reposition so re-opening the cropper resumes
  zoom?:    number
}

function uid() { return Math.random().toString(36).slice(2, 10) }

function entryFor(file: File): FileEntry {
  return {
    id:           uid(),
    file,
    originalFile: file,
    preview:      URL.createObjectURL(file),
    isVideo:      file.type.startsWith("video/"),
  }
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

function MediaCarouselPreview({ entries, onRemove, onCropEntry }: {
  entries: FileEntry[]
  onRemove: (id: string) => void
  onCropEntry: (id: string, file: File, crop: CropState, zoom: number) => void
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

        <button className={styles.previewRemoveBtn} onClick={() => { onRemove(current.id); if (idx > 0 && idx === total - 1) setIdx(idx - 1) }}
          type="button" aria-label="Remove">
          <Icon icon="mdi:close" width={14} height={14} />
        </button>

        {current.isVideo && (
          <div className={styles.previewVideoBadge}>
            <Icon icon="mdi:play-circle-outline" width={14} height={14} /> Video
          </div>
        )}

        {/* Adjust / crop — images only */}
        {!current.isVideo && (
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

// ── Main CreatePostModal ──────────────────────────────────────
//
// Post hands the draft to the upload queue (shared/upload/uploadQueue.ts) and
// the composer closes at once — the author keeps using the app while the
// UploadQueueBar shows "Posting… 45%". Failures, Retry and "Post without
// sound" live in that bar, with the files kept in the task.

interface CreatePostModalProps {
  username:       string
  userAvatarUrl?: string
  userInitials?:  string
  displayName?:   string
  /** Start from this instead of an empty composer — the queue's "Edit". */
  initialDraft?:  PostComposerDraft
  onClose:        () => void
}

export default function CreatePostModal({
  username, userAvatarUrl, userInitials, displayName, initialDraft, onClose,
}: CreatePostModalProps) {
  // The ACTOR's sports, not the person's — an org composer must not offer
  // the sports of whoever happens to be signed in behind it.
  const { sports: actorSports, primarySportId } = usePostSports()
  // Whether the server converts what the phone cannot: wider video formats.
  const { server_processing: serverProcessing } = useMediaCapabilities()

  // Compose state
  const [content,      setContent]      = useState(initialDraft?.content ?? "")
  const [visibility,   setVisibility]   = useState<PostVisibility>(initialDraft?.visibility ?? "public")
  const [entries,      setEntries]      = useState<FileEntry[]>(() => (initialDraft?.files ?? []).map(entryFor))
  const [submitError,  setSubmitError]  = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  /**
   * PRESELECTED, not forced. Most people post about the one sport they are
   * on file as playing, so the composer starts there and they change it on
   * the rare post that is about something else.
   *
   * `sportChoice` is what makes it a default rather than a correction: null
   * until the author picks anything — including clearing it, which is "" —
   * and from then on the default stops having an opinion, so a sport they
   * deliberately removed does not come back. Derived during render rather
   * than copied in by an effect, so a primary sport that loads late is
   * simply picked up.
   */
  const [sportChoice, setSportChoice] = useState<string | null>(initialDraft?.sportId ?? null)
  const sportId = sportChoice ?? primarySportId ?? ""

  const chooseSport = (next: string) => {
    setSportChoice(next === CLEAR_SPORT ? "" : next)
  }

  // Location state — managed outside any form library
  const [postLocation,  setPostLocation]  = useState<PlaceResult | null>(initialDraft?.location ?? null)
  const [locationOpen,  setLocationOpen]  = useState(false)
  // The actor's own coordinates, as a 50 km bias circle for place search.
  // Cache-only: never fetches, and null is a perfectly normal answer.
  const placeBias = useProfileBias()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const bodyRef      = useRef<HTMLDivElement>(null)

  const hasVideo     = entries.some(e => e.isVideo)
  const hasImages    = entries.some(e => !e.isVideo)

  // ── Unsaved-changes guard ─────────────────────────────────────
  const isDirty =
    content.trim() !== "" ||
    entries.length > 0 ||
    postLocation !== null ||
    // The PRESELECTED sport is not a change the author made, so an untouched
    // composer is not dirty and closing it must not ask them to discard
    // anything. Moving off that default is.
    sportId !== (primarySportId ?? "") ||
    visibility !== "public"

  // Close, but confirm first if the user has started composing.
  const requestClose = () => {
    if (isDirty) setConfirmDiscard(true)
    else onClose()
  }

  // ── Manage body scroll lock ───────────────────────────────────
  useBodyScrollLock()

  // ── Auto-resize textarea ──────────────────────────────────────
  const resizeTextarea = (ta: HTMLTextAreaElement) => {
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`
  }

  // ── @mention autocomplete ─────────────────────────────────────
  const mention = useMentionAutocomplete({
    value: content,
    textareaRef,
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
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (!files.length) return
    setSubmitError(null)

    const combined = [...entries.map(en => en.file), ...files]
    const err = validateMediaFiles(combined, { serverProcessing })
    if (err) { setSubmitError(err); return }

    // A clip over 5 minutes is refused NOW, while the draft is still in
    // front of the author. After Post it could only fail in the queue bar,
    // with the caption out of reach. A length the browser cannot read is
    // left to the upload (and to the server, when it converts).
    const video = files.find(f => f.type.startsWith("video/"))
    if (video) {
      const length = await checkVideoDuration(video, MAX_VIDEO_SECONDS)
      if (!length.ok && length.reason === "too_long") {
        setSubmitError(VIDEO_TOO_LONG_MESSAGE)
        return
      }
    }

    setEntries(prev => [...prev, ...files.map(entryFor)])
  }, [entries, serverProcessing])

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
  // The quick checks run here, while the author can still act on them; then
  // the draft goes to the queue and the composer closes. Everything slow —
  // compressing, encoding, uploading, the create — happens in the background.
  const handleSubmit = () => {
    setSubmitError(null)
    const trimmed = content.trim()
    if (trimmed.length < 3) {
      setSubmitError("Post content must be at least 3 characters.")
      textareaRef.current?.focus()
      return
    }

    // No connection at all: say so now, before compressing or encoding
    // anything that could only fail at the first byte.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSubmitError(OFFLINE_MESSAGE)
      return
    }

    const files = entries.map(e => e.file)
    const invalid = validateMediaFiles(files, { serverProcessing })
    if (invalid) { setSubmitError(invalid); return }

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

    // The files ride in the task, in memory: Retry (and "Post without
    // sound") re-run this without the author picking anything again.
    const draft: PostDraft = {
      files,
      payload: {
        content:   trimmed,
        post_type: "normal",
        visibility,
        sport_id:  sportId || undefined,
        location:  locationPayload,
      },
    }
    const first = entries[0]
    // What "Edit" reopens if this fails in a way no retry can fix.
    const snapshot: PostComposerDraft = {
      content, visibility, sportId: sportChoice, location: postLocation, files,
    }

    enqueueUpload({
      kind: "post",
      label: trimmed,
      preview: { mediaType: first ? (first.isVideo ? "video" : "image") : "none" },
      previewFile: first?.file,
      run: (ctx) => runPostUpload(draft, ctx),
      onEdit: () => reopenPostComposer(snapshot),
    })
    onClose()
  }

  const contentLen  = content.length
  const charWarning = contentLen > 2800
  const canSubmit   = content.trim().length >= 3

  return (
    <div
      className={styles.backdrop}
      onClick={e => { if (e.target === e.currentTarget) requestClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Create post"
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Create Post</h2>
          <button className={styles.closeBtn} onClick={requestClose} type="button" aria-label="Close">
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
              <div className={styles.authorBadges}>
                <VisibilityBtn value={visibility} onChange={setVisibility} />
                
                {/* Sport — a Select wearing a badge, so the row reads as
                    three chips rather than two chips and a form field. */}
                {actorSports.length > 0 && (
                  <Select
                    className={styles.sportField}
                    size="sm"
                    aria-label="Tag a sport"
                    sheetTitle="Tag a sport"
                    placeholder="Sport"
                    leadingIcon="mdi:shape-outline"
                    value={sportId}
                    onChange={chooseSport}
                    options={sportOptions(actorSports, sportId)}
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
          {locationOpen && (
            <PostLocationPicker
              value={postLocation}
              onChange={setPostLocation}
              onClose={() => setLocationOpen(false)}
              bias={placeBias}
            />
          )}

          {/* Media carousel */}
          {entries.length > 0 && (
            <MediaCarouselPreview
              entries={entries}
              onRemove={removeEntry}
              onCropEntry={handleCropEntry}
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

        {/* ── Footer toolbar ── */}
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

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple={!hasVideo && !entries.some(e => e.isVideo)}
          // `video/*` only when the server converts what the phone cannot;
          // otherwise MP4/MOV/WebM by name — validateMediaFiles refuses the
          // rest, so the picker should not offer them.
          accept={`image/*,${videoAcceptFor(serverProcessing)}`}
          onChange={handleFileChange}
        />

      </div>

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
