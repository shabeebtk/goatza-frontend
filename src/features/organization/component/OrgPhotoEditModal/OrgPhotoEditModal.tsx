"use client"

/**
 * OrgPhotoEditModal
 *
 * Handles both org logo (1:1 SQUARE crop) and cover (COVER_ASPECT_RATIO).
 * Logo preview is square with rounded corners — NOT circular like user profile.
 * The crop itself is OrgPhotoCropSheet, which opens on top of this modal and
 * runs the upload as its Apply; the create page uses the same sheet.
 *
 * Props:
 *   type       — "logo" | "cover"
 *   currentSrc — existing photo URL
 *   orgId      — for cache invalidation
 *   isOwn      — hide edit actions for non-admin viewers
 *   onClose    — called when done
 */

import { useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { useOrgPhotoUpload, type OrgPhotoType } from "../../hooks/useOrgPhotoUpload"
import OrgPhotoCropSheet from "../OrgPhotoCropSheet/OrgPhotoCropSheet"
import styles from "./OrgPhotoEditModal.module.css"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { ensureDecodableImage } from "@/shared/services/imageVariants"
import { checkRawImageSize, isImageFile } from "@/shared/constants/media"

// ── Config ────────────────────────────────────────────────────

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

  const [cropFile, setCropFile] = useState<File | null>(null)
  const [error, setError]       = useState<string | null>(null)

  // Body scroll lock
  useBodyScrollLock()

  // ── File pick ─────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = ""
    if (!picked) return
    setError(null)
    // By type, or by extension when the browser gave none (a .heic on Windows).
    if (!isImageFile(picked)) { setError("Pick a photo."); return }
    // The shared 25 MB pick-time ceiling; the server's 5 MB cap is on the
    // compressed file, which uploadOrgPhoto holds it to.
    const tooLarge = checkRawImageSize(picked)
    if (tooLarge) { setError(tooLarge); return }
    // The cropper renders the photo itself, so a HEIC this browser cannot
    // decode (Chrome, Firefox) is converted to JPEG before it gets there.
    try {
      setCropFile(await ensureDecodableImage(picked, { flow: "single", surface: `organization_${type}` }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't open that photo.")
    }
  }

  // ── Crop applied → upload ─────────────────────────────────
  // A throw is shown by the sheet, which keeps the crop for a retry.
  const handleCropped = async (blob: Blob) => {
    if (!cropFile) return
    await upload.mutateAsync({ type, croppedBlob: blob, originalName: cropFile.name })
    setCropFile(null)
    onClose()
  }

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    setError(null)
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
    if (e.target === e.currentTarget && !cropFile) onClose()
  }

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={handleBackdrop}
        role="dialog"
        aria-modal="true"
        aria-label={`${LABELS[type]} editor`}
      >
        <div className={styles.modal}>

          {/* ── Header ── */}
          <div className={styles.header}>
            <div className={styles.headerSpacer} />
            <h2 className={styles.headerTitle}>{LABELS[type]}</h2>
            <button className={styles.headerBtn} onClick={onClose} type="button" aria-label="Close">
              <Icon icon="mdi:close" width={20} height={20} />
            </button>
          </div>

          {/* ── VIEW ── */}
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

          {error && (
            <p className={styles.errorMsg} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
              {error}
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

      {/* A sibling, not a child: it is portalled anyway, and keeping it out of
          the backdrop keeps its clicks away from the backdrop's handler. */}
      {cropFile && (
        <OrgPhotoCropSheet
          type={type}
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={handleCropped}
        />
      )}
    </>
  )
}
