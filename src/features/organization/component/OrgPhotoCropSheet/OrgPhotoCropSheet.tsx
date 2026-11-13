"use client"

/**
 * OrgPhotoCropSheet — crop one org logo (1:1) or cover (COVER_ASPECT_RATIO).
 *
 * The crop step on its own, so the create page (no org yet, nothing uploaded)
 * and the photo editor on an existing page (uploads straight away) share it.
 * It takes a file that is ALREADY checked and decodable — the caller runs
 * isImageFile / checkRawImageSize / ensureDecodableImage at pick time — and
 * hands back the cropped blob. What happens to the blob is the caller's.
 *
 * `onDone` may return a promise: while it runs the sheet shows a busy Apply,
 * and if it rejects the error is shown here and the crop stays put, so the
 * person can try again without picking the photo twice.
 *
 * Overlay rules (CLAUDE.md): portalled, scroll lock, one history entry so a
 * back press cancels, `--z-image-cropper`, a bottom sheet below 768px and a
 * dialog from 768px. The cropper carries `data-allow-touchmove` so the scroll
 * lock does not cancel its drag and pinch.
 *
 * A back press while the blob is being saved is refused: the save is already
 * on its way, and closing under it would show the old photo as if it had
 * failed. The press has already used up the sheet's history entry by then,
 * so useGuardedBack reserves a fresh one — otherwise the NEXT press would
 * leave the page underneath.
 *
 * On a short screen (a phone on its side) the crop well gives up height
 * first, and the sheet scrolls if even that is not enough, so the buttons are
 * always reachable.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Cropper from "react-easy-crop"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import Button from "@/shared/components/ui/Button/Button"
import { useGuardedBack } from "@/shared/hooks/useGuardedBack"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { getCroppedBlob, type PixelCrop } from "@/features/profile/utils/getCroppedBlob"
import { COVER_ASPECT_RATIO } from "@/constants"
import type { OrgPhotoType } from "../../services/uploadOrgPhoto"
import styles from "./OrgPhotoCropSheet.module.css"

export const ORG_PHOTO_ASPECT: Record<OrgPhotoType, number> = {
  logo:  1,                   // square, shown with rounded corners — not a circle
  cover: COVER_ASPECT_RATIO,  // the banner's own ratio, so the crop is what renders
}

const TITLES: Record<OrgPhotoType, string> = {
  logo:  "Crop logo",
  cover: "Crop cover",
}

export interface OrgPhotoCropSheetProps {
  type:     OrgPhotoType
  file:     File
  onCancel: () => void
  onDone:   (blob: Blob) => void | Promise<void>
  /** The confirm button's words. Default "Apply". */
  confirmLabel?: string
  /** The crop's width / height. Default: the type's own (1 for a logo, the cover ratio). */
  aspect?: number
  /** The sheet's heading. Default: "Crop logo" / "Crop cover". */
  title?: string
}

export default function OrgPhotoCropSheet({
  type,
  file,
  onCancel,
  onDone,
  confirmLabel = "Apply",
  aspect,
  title,
}: OrgPhotoCropSheetProps) {
  const titleId = useId()
  // An object URL, not a data URL: nothing read into memory twice. ONE per
  // mount — a sheet crops one file, so a caller with a new file mounts a new
  // sheet (key it by the file if it ever stays open across picks).
  const [src] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop]         = useState({ x: 0, y: 0 })
  const [zoom, setZoom]         = useState(1)
  const [area, setArea]         = useState<PixelCrop | null>(null)
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useBodyScrollLock()

  // Refused while busy (see the top); every way out goes through `close`, which
  // walks back through the sheet's entry.
  const { guard, close: requestClose } = useGuardedBack(onCancel, () => busy)

  // Revoked when the sheet goes — a tick later, and cancelled by a remount, so
  // StrictMode's simulated unmount doesn't revoke the URL still on screen.
  const revokeTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (revokeTimerRef.current !== null) {
      window.clearTimeout(revokeTimerRef.current)
      revokeTimerRef.current = null
    }
    return () => {
      revokeTimerRef.current = window.setTimeout(() => URL.revokeObjectURL(src), 0)
    }
  }, [src])

  const onCropComplete = useCallback((_: unknown, px: PixelCrop) => setArea(px), [])

  const handleApply = async () => {
    if (!area || busy) return
    setError(null)
    setBusy(true)
    try {
      const blob = await getCroppedBlob(src, area)
      await onDone(blob)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't use that photo. Try again.")
      setBusy(false)
    }
  }

  return (
    <Portal>
      {guard}
      <div
        className={styles.backdrop}
        onClick={(event) => {
          if (event.target === event.currentTarget && !busy) requestClose()
        }}
      >
        <div
          className={styles.sheet}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title ?? TITLES[type]}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={requestClose}
              disabled={busy}
              aria-label="Cancel"
            >
              <Icon icon="mdi:close" width={20} height={20} />
            </button>
          </div>

          <div
            className={`${styles.cropArea} ${type === "cover" ? styles.cropAreaCover : ""}`}
            data-allow-touchmove=""
          >
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect ?? ORG_PHOTO_ASPECT[type]}
              cropShape="rect"
              showGrid={type === "cover"}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div className={styles.zoom}>
            <Icon icon="mdi:magnify-minus-outline" width={18} height={18} aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className={styles.slider}
              aria-label="Zoom"
              disabled={busy}
            />
            <Icon icon="mdi:magnify-plus-outline" width={18} height={18} aria-hidden="true" />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={14} height={14} aria-hidden="true" />
              {error}
            </p>
          )}

          <div className={styles.footer}>
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleApply}
              loading={busy}
              disabled={!area}
              className={styles.apply}
            >
              {busy ? "Saving…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
