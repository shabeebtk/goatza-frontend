"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import PostLocationPicker from "../PostLocationPicker/PostLocationPicker"
import { useMyPostSports, useUpdatePost } from "@/features/posts/hooks/usePostMutations"
import { getPostAspectRatio } from "@/features/posts/utils/media"
import { videoDeliveryUrl, videoPosterUrl } from "@/shared/services/cloudinaryDelivery"
import type { Post, PostMedia, PostVisibility, PostLocation, UpdatePostPayload } from "@/features/posts/services/posts.api"
import type { MapboxPlace } from "@/shared/services/mapbox.service"
import shared from "../CreatePostModal/CreatePostModal.module.css"
import styles from "./EditPostModal.module.css"

// ── Read-only media preview — clamped ratio, no editing ───────

function EditMediaPreview({ media }: { media: PostMedia[] }) {
  const [idx, setIdx] = useState(0)
  const sorted = useMemo(() => [...media].sort((a, b) => a.order - b.order), [media])
  const ratio = getPostAspectRatio(sorted)
  const total = sorted.length
  const current = sorted[Math.min(idx, total - 1)]

  return (
    <div className={styles.previewBox} style={{ aspectRatio: ratio }}>
      {current.media_type === "video" ? (
        <video
          key={current.file_url}
          // Already-uploaded media, so this is a stored Cloudinary original —
          // same transcoded delivery as the feed, not the raw file.
          src={videoDeliveryUrl(current.file_url)}
          className={styles.previewMedia}
          poster={current.thumbnail_url ? videoPosterUrl(current.thumbnail_url) : undefined}
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <img key={current.file_url} src={current.file_url} className={styles.previewMedia} alt="" />
      )}

      {current.media_type === "video" && (
        <span className={styles.previewVideoBadge}>
          <Icon icon="mdi:play" width={12} height={12} /> Video
        </span>
      )}

      {total > 1 && (
        <>
          {idx > 0 && (
            <button
              type="button"
              className={`${styles.previewNav} ${styles.previewNavPrev}`}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              aria-label="Previous"
            >
              <Icon icon="mdi:chevron-left" width={18} height={18} />
            </button>
          )}
          {idx < total - 1 && (
            <button
              type="button"
              className={`${styles.previewNav} ${styles.previewNavNext}`}
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
              aria-label="Next"
            >
              <Icon icon="mdi:chevron-right" width={18} height={18} />
            </button>
          )}
          <div className={styles.previewCounter}>{Math.min(idx, total - 1) + 1}/{total}</div>
        </>
      )}
    </div>
  )
}

// ── Visibility toggle (mirrors CreatePostModal) ───────────────

function VisibilityBtn({ value, onChange }: {
  value: PostVisibility
  onChange: (v: PostVisibility) => void
}) {
  return (
    <button
      type="button"
      className={shared.badgeBtn}
      onClick={() => onChange(value === "public" ? "followers" : "public")}
      aria-label={`Visibility: ${value}`}
    >
      <Icon icon={value === "public" ? "mdi:earth" : "mdi:account-group-outline"} width={13} height={13} />
      {value === "public" ? "Public" : "Followers"}
    </button>
  )
}

// Local location edit state: keep the original, clear it, or set a new place.
type LocationEdit =
  | { kind: "keep" }
  | { kind: "cleared" }
  | { kind: "set"; place: MapboxPlace }

function buildLocationPayload(place: MapboxPlace): PostLocation {
  return {
    name:         place.name,
    type:         place.place_type,
    city:         place.place_type === "place" ? place.name : undefined,
    state:        place.state || undefined,
    country_code: place.country_code,
    latitude:     place.latitude,
    longitude:    place.longitude,
    external_id:  place.external_id,
  }
}

interface EditPostModalProps {
  post: Post
  onClose: () => void
}

export default function EditPostModal({ post, onClose }: EditPostModalProps) {
  const { data: mySports } = useMyPostSports()
  const updatePost = useUpdatePost()

  const initialSportId = post.sport?.id ?? ""

  const [content, setContent]       = useState(post.content)
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility as PostVisibility)
  const [sportId, setSportId]       = useState(initialSportId)
  const [locationEdit, setLocationEdit] = useState<LocationEdit>({ kind: "keep" })
  const [locationOpen, setLocationOpen] = useState(false)
  const [submitError, setSubmitError]   = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasMedia = post.media.length > 0

  // Always let the current sport be selectable, even if it's no longer in the
  // actor's sport list.
  const sportOptions = useMemo(() => {
    const opts = (mySports ?? []).map((ms) => ({ id: ms.sport.id, name: ms.sport.name }))
    if (post.sport && !opts.some((o) => o.id === post.sport!.id)) {
      opts.unshift({ id: post.sport.id, name: post.sport.name })
    }
    return opts
  }, [mySports, post.sport])

  // Displayed location name (new pick → original → none).
  const displayLocationName =
    locationEdit.kind === "set"
      ? locationEdit.place.name
      : locationEdit.kind === "keep" && post.location
        ? post.location.name
        : null

  const isDirty =
    content !== post.content ||
    visibility !== post.visibility ||
    sportId !== initialSportId ||
    locationEdit.kind !== "keep"

  const contentValid = hasMedia ? true : content.trim().length >= 3
  const canSave = isDirty && contentValid && !saving

  // Lock body scroll while open
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = original }
  }, [])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    const ta = e.target
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`
  }

  const handleLocationChange = (place: MapboxPlace | null) => {
    setLocationEdit(place ? { kind: "set", place } : { kind: "cleared" })
    if (place) setLocationOpen(false)
  }

  const requestClose = () => {
    if (!saving) onClose()
  }

  const handleSave = async () => {
    setSubmitError(null)
    const trimmed = content.trim()
    if (!hasMedia && trimmed.length < 3) {
      setSubmitError("Post content must be at least 3 characters.")
      textareaRef.current?.focus()
      return
    }

    const payload: UpdatePostPayload = {
      post_id:    post.id,
      content:    trimmed,
      visibility,
      sport_id:   sportId || null,
    }
    if (locationEdit.kind === "cleared") payload.location = null
    else if (locationEdit.kind === "set") payload.location = buildLocationPayload(locationEdit.place)
    // kind === "keep" → leave location untouched (omit)

    setSaving(true)
    try {
      await updatePost.mutateAsync(payload)
      onClose()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save. Try again.")
      setSaving(false)
    }
  }

  const contentLen  = content.length
  const charWarning = contentLen > 2800

  return createPortal(
    <div
      className={shared.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit post"
    >
      <div className={shared.modal}>

        {/* ── Header ── */}
        <div className={shared.header}>
          <h2 className={shared.headerTitle}>Edit Post</h2>
          <button className={shared.closeBtn} onClick={requestClose} disabled={saving} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className={shared.body}>

          {/* Author row */}
          <div className={shared.authorRow}>
            <Avatar
              src={post.author.profile_photo || post.author.logo}
              initials={post.author.name?.slice(0, 2).toUpperCase()}
              size="md"
            />
            <div className={shared.authorMeta}>
              <span className={shared.authorName}>{post.author.name}</span>
              <div className={shared.authorBadges}>
                <VisibilityBtn value={visibility} onChange={setVisibility} />

                {/* Sport select */}
                {sportOptions.length > 0 && (
                  <div className={shared.badgeSelectWrap}>
                    <Icon icon="mdi:trophy-outline" width={12} height={12} className={shared.badgeSelectIcon} />
                    <select
                      className={shared.badgeSelect}
                      value={sportId}
                      onChange={(e) => setSportId(e.target.value)}
                      aria-label="Tag a sport"
                    >
                      <option value="">SELECT SPORT</option>
                      {sportOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Location toggle / pill */}
                {displayLocationName ? (
                  <div className={shared.badgePill}>
                    <Icon icon="mdi:map-marker" width={12} height={12} />
                    <span className={shared.badgePillText}>{displayLocationName}</span>
                    <button
                      type="button"
                      className={shared.badgePillClose}
                      onClick={() => setLocationEdit({ kind: "cleared" })}
                      aria-label="Remove location"
                    >
                      <Icon icon="mdi:close" width={10} height={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`${shared.badgeBtn} ${locationOpen ? shared.badgeBtnActive : ""}`}
                    onClick={() => setLocationOpen((v) => !v)}
                    aria-label="Add location"
                  >
                    <Icon icon="mdi:map-marker-plus-outline" width={13} height={13} />
                    LOCATION
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content textarea */}
          <textarea
            ref={textareaRef}
            className={shared.contentTextarea}
            placeholder="What's on your mind?"
            value={content}
            onChange={handleTextChange}
            rows={3}
            maxLength={3000}
            disabled={saving}
            aria-label="Post content"
          />

          {charWarning && (
            <p className={`${shared.charCount} ${contentLen > 2950 ? shared.charCountDanger : ""}`}>
              {3000 - contentLen} remaining
            </p>
          )}

          {/* Location picker — inline when toggled */}
          {locationOpen && (
            <div className={shared.locationPickerWrap}>
              <PostLocationPicker
                value={locationEdit.kind === "set" ? locationEdit.place : null}
                onChange={handleLocationChange}
                disabled={saving}
              />
            </div>
          )}

          {/* Media preview — read-only (media can't be edited) */}
          {hasMedia && (
            <>
              <div className={styles.mediaPreview}>
                <EditMediaPreview media={post.media} />
              </div>
              <p className={styles.mediaHint}>
                <Icon icon="mdi:lock-outline" width={13} height={13} />
                Photos and video can&rsquo;t be changed
              </p>
            </>
          )}

          {/* Error */}
          {submitError && (
            <p className={shared.submitError} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
              {submitError}
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className={shared.footer}>
          <div className={shared.footerTools}>
            <span className={styles.footerNote}>Editing post</span>
          </div>
          <div className={shared.footerRight}>
            <button type="button" className={shared.postBtn} onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
