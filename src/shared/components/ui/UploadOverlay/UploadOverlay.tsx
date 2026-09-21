"use client"

/**
 * UploadOverlay — the full-sheet "Uploading 2/5 · 43%" screen a composer
 * shows from Post/Publish until the redirect.
 *
 * One ring for the whole batch, the first item dimmed behind it so the
 * screen still reads as the author's own thing rather than a blank progress
 * page, and Cancel for as long as cancelling is safe: while bytes are still
 * moving. Once the create request itself is in flight ("Publishing…") the
 * record cannot be un-sent, so Cancel goes with it.
 *
 * Shared by the post composer and the recruitment wizard. The host owns the
 * upload (AbortController, entry state) and the wording — this only draws.
 *
 * Mount it absolutely inside a `position: relative` sheet; it covers
 * everything, footer included.
 */

import { useEffect } from "react"
import { Icon } from "@iconify/react"
import styles from "./UploadOverlay.module.css"

export type UploadOverlayPhase = "uploading" | "posting" | "done"

/** The slice of a composer's file entry the overlay needs. */
export type UploadOverlayItem = {
  /** Object URL or remote URL of the item, shown blurred behind the ring. */
  preview: string
  isVideo?: boolean
  /** 0–100 for this item. */
  progress: number
  status: "idle" | "uploading" | "done" | "error"
  /** Bytes, for the "3 files · 4.2 MB" line. */
  size: number
  /** True while the browser is re-encoding a video, before any bytes move. */
  optimizing?: boolean
}

export interface UploadOverlayProps {
  /** Only the items actually being uploaded — already-stored media is not
   *  part of this batch and would start the ring most of the way along. */
  entries: UploadOverlayItem[]
  phase: UploadOverlayPhase
  /** Shown while encoding a video ("Optimizing video…"). */
  optimizingLabel?: string
  /** "Publishing…" by default. */
  postingLabel?: string
  /** "Posted!" by default. */
  doneLabel?: string
  /** Small line under the done label ("Redirecting…"). */
  doneHint?: string
  onCancel: () => void
  /** Called `doneDelayMs` after the phase turns "done". Omit to leave the
   *  timing to the host. */
  onDone?: () => void
  doneDelayMs?: number
}

/** Circumference of the progress ring (r = 56). */
const RING_R = 56
const RING_C = 2 * Math.PI * RING_R

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadOverlay({
  entries,
  phase,
  optimizingLabel = "Optimizing video…",
  postingLabel = "Publishing…",
  doneLabel = "Posted!",
  doneHint,
  onCancel,
  onDone,
  doneDelayMs = 1800,
}: UploadOverlayProps) {
  const total      = entries.length
  const doneCount  = entries.filter(e => e.status === "done").length
  const overallPct = total === 0 ? 100 : Math.round(entries.reduce((s, e) => s + e.progress, 0) / total)
  const totalBytes = entries.reduce((s, e) => s + e.size, 0)
  const isPosting  = phase === "posting"
  const isDone     = phase === "done"
  // A video spends the first stretch of its bar being encoded, which on a
  // phone is the slower half — saying "Uploading" through it reads as a stall.
  const isOptimizing = entries.some(e => e.optimizing)
  const canCancel    = phase === "uploading"
  const first        = entries[0]

  useEffect(() => {
    if (!isDone || !onDone) return
    const t = setTimeout(onDone, doneDelayMs)
    return () => clearTimeout(t)
  }, [isDone, onDone, doneDelayMs])

  const label = isDone ? doneLabel
    : isPosting || total === 0 ? postingLabel
    : isOptimizing ? optimizingLabel
    : `Uploading ${Math.min(doneCount + 1, total)}/${total}`

  const pct = isPosting || isDone ? 100 : overallPct

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      {first && (
        <div className={styles.bg} aria-hidden="true">
          {first.isVideo ? (
            // `#t=0.001` makes Safari paint the first frame of a paused,
            // metadata-only video instead of leaving the box black.
            <video
              src={`${first.preview}#t=0.001`}
              className={styles.bgMedia}
              muted
              playsInline
              preload="metadata"
              tabIndex={-1}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={first.preview} className={styles.bgMedia} alt="" />
          )}
        </div>
      )}

      <div className={styles.content}>
        <div className={`${styles.ringWrap} ${isPosting ? styles.ringIndeterminate : ""}`}>
          <svg viewBox="0 0 128 128" className={styles.ringSvg} aria-hidden="true">
            <circle cx="64" cy="64" r={RING_R} fill="none" strokeWidth="6" className={styles.ringTrack} />
            <circle
              cx="64" cy="64" r={RING_R} fill="none" strokeWidth="6" strokeLinecap="round"
              className={styles.ringFill}
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct / 100)}
            />
          </svg>
          {isDone ? (
            <span className={styles.done}>
              <Icon icon="mdi:check-circle" width={56} height={56} />
            </span>
          ) : (
            <span className={styles.ringPct}>{isPosting ? "" : `${overallPct}%`}</span>
          )}
        </div>

        <span className={styles.label}>{label}</span>

        {isDone && doneHint && (
          <span className={styles.meta}>{doneHint}</span>
        )}

        {!isDone && total > 0 && (
          <span className={styles.meta}>
            {total > 1 ? `${total} files · ` : ""}{fmtBytes(totalBytes)}
            {!isPosting ? ` · ${overallPct}%` : ""}
          </span>
        )}
      </div>

      {canCancel && (
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
