"use client"

/**
 * OrgPhotoEditModal
 *
 * Handles both org logo (1:1 SQUARE crop) and cover (16:9).
 * Logo preview is square with rounded corners — NOT circular like user profile.
 *
 * Props:
 *   type       — "logo" | "cover"
 *   currentSrc — existing photo URL
 *   orgId      — for cache invalidation
 *   isOwn      — hide edit actions for non-admin viewers
 *   onClose    — called when done
 */

import { useCallback, useRef, useState, useEffect } from "react"
import Cropper from "react-easy-crop"
import { Icon } from "@iconify/react"
import { useOrgPhotoUpload, type OrgPhotoType } from "../../hooks/useOrgPhotoUpload"
import { getCroppedBlob, type PixelCrop } from "@/features/profile/utils/getCroppedBlob"
import styles from "./OrgPhotoEditModal.module.css"

// ── Config ────────────────────────────────────────────────────

type ModalState = "view" | "crop" | "saving"

const ASPECT: Record<OrgPhotoType, number> = {
  logo:  1,        // 1:1 — square crop, square preview
  cover: 16 / 9,
}

const LABELS: Record<OrgPhotoType, string> = {
  logo:  "Organization Logo",
  cover: "Cover Photo",
}

// ── Props ─────────────────────────────────────────────────────

interface OrgPhotoEditModalProps {
  type:       OrgPhotoType
  currentSrc: string | null
  orgId:      string
  isOwn?:     boolean
  onClose:    () => void
}

// ── Component ─────────────────────────────────────────────────

export default function OrgPhotoEditModal({
  type,
  currentSrc,
  orgId,
  isOwn = false,
  onClose,
}: OrgPhotoEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upload, deleteLogo, deleteCover } = useOrgPhotoUpload(orgId)

  const [state, setState]               = useState<ModalState>("view")
  const [imageSrc, setImageSrc]         = useState("")
  const [origName, setOrigName]         = useState("photo.jpg")
  const [error, setError]               = useState<string | null>(null)
  const [crop, setCrop]                 = useState({ x: 0, y: 0 })
  const [zoom, setZoom]                 = useState(1)
  const [croppedArea, setCroppedArea]   = useState<PixelCrop | null>(null)

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── File pick ─────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > 5 * 1024 * 1024) { setError("File must be under 5 MB."); return }
    setOrigName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result as string)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setState("crop")
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const onCropComplete = useCallback(
    (_: unknown, px: PixelCrop) => setCroppedArea(px),
    []
  )

  // ── Confirm → upload ──────────────────────────────────────
  const handleConfirm = async () => {
    if (!croppedArea || !imageSrc) return
    setError(null)
    setState("saving")
    try {
      await upload.mutateAsync({ type, croppedBlob: await getCroppedBlob(imageSrc, croppedArea), originalName: origName })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.")
      setState("crop")
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      if (type === "logo") await deleteLogo.mutateAsync()
      else                 await deleteCover.mutateAsync()
      onClose()
    } catch {
      setError("Failed to remove photo.")
    }
  }

  const isDeleting = deleteLogo.isPending || deleteCover.isPending

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && state === "view") onClose()
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${LABELS[type]} editor`}
    >
      <div className={`${styles.modal} ${state === "crop" ? styles.modalCrop : ""}`}>

        {/* ── Header ── */}
        <div className={styles.header}>
          {state === "crop" ? (
            <button className={styles.headerBtn} onClick={() => setState("view")} type="button" aria-label="Back">
              <Icon icon="mdi:arrow-left" width={20} height={20} />
            </button>
          ) : (
            <div className={styles.headerSpacer} />
          )}
          <h2 className={styles.headerTitle}>{LABELS[type]}</h2>
          <button className={styles.headerBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── VIEW ── */}
        {state === "view" && (
          <>
            <div className={styles.viewWrap}>
              {currentSrc ? (
                <img
                  src={currentSrc}
                  alt={LABELS[type]}
                  className={`${styles.viewImg} ${type === "logo" ? styles.viewImgSquare : ""}`}
                />
              ) : (
                <div className={styles.viewEmpty}>
                  <Icon
                    icon={type === "logo" ? "mdi:office-building-outline" : "mdi:image-outline"}
                    width={72}
                    height={72}
                  />
                  <p>No {LABELS[type].toLowerCase()} set</p>
                </div>
              )}
            </div>

            {/* Hint for logo crop shape */}
            {type === "logo" && (
              <p className={styles.cropHint}>
                <Icon icon="mdi:crop-square" width={14} height={14} />
                Logo is cropped square
              </p>
            )}

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

                  {currentSrc && (
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={handleDelete}
                      disabled={isDeleting}
                      type="button"
                    >
                      {isDeleting
                        ? <><span className={styles.spinner} /> Removing…</>
                        : <><Icon icon="mdi:trash-can-outline" width={20} height={20} /> Remove</>
                      }
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

        {/* ── CROP / SAVING ── */}
        {(state === "crop" || state === "saving") && (
          <>
            <div className={styles.cropArea}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ASPECT[type]}
                cropShape="rect"          /* always rect — logo square, cover 16:9 */
                showGrid={type === "cover"}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {type === "logo" && (
              <div className={styles.cropGuide}>
                <Icon icon="mdi:information-outline" width={13} height={13} />
                Square crop — center your logo
              </div>
            )}

            <div className={styles.zoomWrap}>
              <Icon icon="mdi:magnify-minus-outline" width={18} height={18} className={styles.zoomIcon} />
              <input
                type="range" min={1} max={3} step={0.01}
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
                {state === "saving"
                  ? <><span className={styles.spinner} /> Saving…</>
                  : <><Icon icon="mdi:check" width={18} height={18} /> Apply</>
                }
              </button>
            </div>
          </>
        )}

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