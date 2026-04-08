"use client"

/**
 * PhotoEditModal
 *
 * Single modal handles BOTH profile (1:1) and cover (16:9) photos.
 *
 * States:
 *   "view"   → shows current photo full-screen, bottom sheet with actions
 *   "crop"   → react-easy-crop on the newly selected file
 *   "saving" → spinner while uploading
 *
 * Props:
 *   type       — "profile" | "cover"
 *   currentSrc — existing photo URL (shown in view mode)
 *   username   — passed to usePhotoUpload for cache invalidation
 *   onClose    — called when modal should close
 *   onDelete   — optional, called when user taps "Remove photo"
 */

import { useCallback, useRef, useState, useEffect } from "react"
import Cropper from "react-easy-crop"
import { Icon } from "@iconify/react"
import { usePhotoUpload } from "@/features/profile/hooks/usePhotoUpload"
import { getCroppedBlob, type PixelCrop } from "@/features/profile/utils/getCroppedBlob"
import styles from "./PhotoEditModal.module.css"

// ── Types ────────────────────────────────────────────────────

type ModalState = "view" | "crop" | "saving"

interface PhotoEditModalProps {
  type: "profile" | "cover"
  currentSrc: string
  username: string
  isOwn?: boolean          // hide edit actions when viewing another user
  onClose: () => void
  onDelete?: () => void   // wire to your delete API when ready
}

// ── Aspect ratios per type ────────────────────────────────────

const ASPECT: Record<"profile" | "cover", number> = {
  profile: 1,           // 1:1 square
  cover:   16 / 9,      // 16:9
}

const LABELS: Record<"profile" | "cover", string> = {
  profile: "Profile Photo",
  cover:   "Cover Photo",
}

// ── Component ────────────────────────────────────────────────

export default function PhotoEditModal({
  type,
  currentSrc,
  username,
  isOwn = false,
  onClose,
  onDelete,
}: PhotoEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const upload       = usePhotoUpload(username)

  const [state, setState]           = useState<ModalState>("view")
  const [imageSrc, setImageSrc]     = useState<string>("")
  const [origName, setOrigName]     = useState<string>("photo.jpg")
  const [error, setError]           = useState<string | null>(null)

  // react-easy-crop state
  const [crop, setCrop]             = useState({ x: 0, y: 0 })
  const [zoom, setZoom]             = useState(1)
  const [croppedArea, setCroppedArea] = useState<PixelCrop | null>(null)

  // Manage body scroll lock
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // ── File selection ────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    // 5 MB gate
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.")
      return
    }

    setOrigName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result as string)
      // Reset crop position
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setState("crop")
    }
    reader.readAsDataURL(file)
    // Clear input so same file can be re-selected
    e.target.value = ""
  }

  const onCropComplete = useCallback(
    (_: unknown, pixelCrop: PixelCrop) => setCroppedArea(pixelCrop),
    []
  )

  // ── Confirm crop → upload ─────────────────────────────────

  const handleConfirm = async () => {
    if (!croppedArea || !imageSrc) return
    setError(null)
    setState("saving")
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea)
      await upload.mutateAsync({ type, croppedBlob: blob, originalName: origName })
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again."
      setError(msg)
      setState("crop")
    }
  }

  // ── Backdrop click closes on view mode ────────────────────

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && state === "view") onClose()
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.backdrop} onClick={handleBackdrop} role="dialog" aria-modal="true"
      aria-label={`${LABELS[type]} editor`}>

      <div className={`${styles.modal} ${state === "crop" ? styles.modalCrop : ""}`}>

        {/* ── Header ── */}
        <div className={styles.header}>
          {state === "crop" ? (
            <button
              className={styles.headerBtn}
              onClick={() => setState("view")}
              type="button"
              aria-label="Back"
            >
              <Icon icon="mdi:arrow-left" width={20} height={20} />
            </button>
          ) : (
            <div className={styles.headerSpacer} />
          )}

          <h2 className={styles.headerTitle}>{LABELS[type]}</h2>

          <button
            className={styles.headerBtn}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── View mode: full photo preview ── */}
        {state === "view" && (
          <>
            <div className={styles.viewWrap}>
              {currentSrc ? (
                <img
                  src={currentSrc}
                  alt={LABELS[type]}
                  className={`${styles.viewImg} ${type === "profile" ? styles.viewImgCircle : ""}`}
                />
              ) : (
                <div className={styles.viewEmpty}>
                  <Icon
                    icon={type === "profile" ? "mdi:account-circle-outline" : "mdi:image-outline"}
                    width={72}
                    height={72}
                  />
                  <p>No {LABELS[type].toLowerCase()} set</p>
                </div>
              )}
            </div>

            {/* Bottom action sheet — only visible to the profile owner */}
            <div className={styles.actionSheet}>
              {isOwn && (
                <>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Icon icon="mdi:camera-plus-outline" width={20} height={20} />
                    {currentSrc ? `Change ${LABELS[type]}` : `Add ${LABELS[type]}`}
                  </button>

                  {currentSrc && onDelete && (
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={onDelete}
                      type="button"
                    >
                      <Icon icon="mdi:trash-can-outline" width={20} height={20} />
                      Remove Photo
                    </button>
                  )}
                </>
              )}

              <button
                className={`${styles.actionBtn} ${styles.actionBtnCancel}`}
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* ── Crop mode ── */}
        {(state === "crop" || state === "saving") && (
          <>
            <div className={styles.cropArea}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT[type]}
                cropShape={type === "profile" ? "round" : "rect"}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {/* Zoom slider */}
            <div className={styles.zoomWrap}>
              <Icon icon="mdi:magnify-minus-outline" width={18} height={18} className={styles.zoomIcon} />
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className={styles.zoomSlider}
                aria-label="Zoom"
                disabled={state === "saving"}
              />
              <Icon icon="mdi:magnify-plus-outline" width={18} height={18} className={styles.zoomIcon} />
            </div>

            {error && (
              <p className={styles.errorMsg} role="alert">
                <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
                {error}
              </p>
            )}

            <div className={styles.cropActions}>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnCancel}`}
                onClick={() => setState("view")}
                disabled={state === "saving"}
                type="button"
              >
                Back
              </button>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnConfirm}`}
                onClick={handleConfirm}
                disabled={state === "saving"}
                type="button"
              >
                {state === "saving" ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:check" width={18} height={18} />
                    Apply
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* Hidden file input — only rendered for owner */}
        {isOwn && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />
        )}
      </div>
    </div>
  )
}