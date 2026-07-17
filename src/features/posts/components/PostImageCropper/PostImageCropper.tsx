"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Cropper from "react-easy-crop"
import { Icon } from "@iconify/react"
import { getCroppedBlob, type PixelCrop } from "@/features/profile/utils/getCroppedBlob"
import styles from "./PostImageCropper.module.css"

export type CropState = { x: number; y: number }

interface PostImageCropperProps {
  /** Object URL of the ORIGINAL image (crop is always taken from the original). */
  src: string
  /** Target aspect ratio (width ÷ height) — the post's display ratio. */
  aspect: number
  initialCrop?: CropState
  initialZoom?: number
  onCancel: () => void
  onApply: (blob: Blob, crop: CropState, zoom: number) => void
}

export default function PostImageCropper({
  src,
  aspect,
  initialCrop,
  initialZoom,
  onCancel,
  onApply,
}: PostImageCropperProps) {
  const [crop, setCrop] = useState<CropState>(initialCrop ?? { x: 0, y: 0 })
  const [zoom, setZoom] = useState(initialZoom ?? 1)
  const [area, setArea] = useState<PixelCrop | null>(null)
  const [busy, setBusy] = useState(false)

  // Lock body scroll while cropping
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  const onCropComplete = useCallback(
    (_: unknown, pixels: PixelCrop) => setArea(pixels),
    []
  )

  const handleApply = async () => {
    if (!area || busy) return
    setBusy(true)
    try {
      // High-quality JPEG — the upload step re-encodes to WebP afterwards.
      const blob = await getCroppedBlob(src, area, "image/jpeg", 0.95)
      onApply(blob, crop, zoom)
    } catch {
      setBusy(false)
    }
  }

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Adjust photo">
      <div className={styles.header}>
        <button className={styles.headerBtn} onClick={onCancel} disabled={busy} type="button" aria-label="Cancel">
          <Icon icon="mdi:close" width={22} height={22} />
        </button>
        <span className={styles.headerTitle}>Adjust</span>
        <button className={styles.applyBtn} onClick={handleApply} disabled={busy || !area} type="button">
          {busy ? <span className={styles.spinner} aria-hidden="true" /> : <><Icon icon="mdi:check" width={16} height={16} />Done</>}
        </button>
      </div>

      <div className={styles.cropArea}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={1}
          maxZoom={3}
          restrictPosition
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className={styles.hint}>
        <Icon icon="mdi:gesture-swipe" width={14} height={14} />
        Drag to reposition · pinch or use the slider to zoom
      </div>

      <div className={styles.zoomWrap}>
        <Icon icon="mdi:magnify-minus-outline" width={18} height={18} />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className={styles.zoomSlider}
          aria-label="Zoom"
          disabled={busy}
        />
        <Icon icon="mdi:magnify-plus-outline" width={18} height={18} />
      </div>
    </div>,
    document.body
  )
}
