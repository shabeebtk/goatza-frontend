"use client"

/**
 * ViewerMedia — one slide of the viewer: an image (with zoom on the active
 * slide) or a video (only ever mounted for the active slide, so exactly one
 * plays).
 *
 * The tap comes from useDoubleTap: a single tap is held back ~250ms so a
 * double-tap can be a like without the first tap also pausing the video.
 * Images show the 640px copy immediately and swap to the full object once
 * it has loaded — the card already has the thumbnail cached, so the viewer
 * opens on something.
 */

import { useEffect, useState, type RefObject } from "react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import type { useZoomPan } from "@/features/posts/hooks/useZoomPan"
import { posterSrc, thumbSrc } from "@/shared/services/mediaDelivery"
import LikeBurst from "./LikeBurst"
import { useDoubleTap } from "./useDoubleTap"
import ViewerVideo, { type ViewerVideoApi } from "./ViewerVideo"
import styles from "./ViewerMedia.module.css"

export type ZoomPan = ReturnType<typeof useZoomPan>

interface ViewerMediaProps {
  item: PostMedia
  /** The slide on screen: mounts the video, takes the gestures. */
  active: boolean
  layout: "phone" | "desktop"
  zoom: ZoomPan
  videoApiRef: RefObject<ViewerVideoApi | null>
  /** Double-tap / double-click: like. */
  onDoubleTap: () => void
  /** Increment to replay the bolt burst. */
  burstKey: number
}

/** The 640px copy first, the full object once the browser has it. */
function useProgressiveSrc(item: PostMedia): string {
  const [src, setSrc] = useState(() => thumbSrc(item))

  useEffect(() => {
    const full = item.file_url
    if (!full || full === thumbSrc(item)) return
    let cancelled = false
    const img = new Image()
    img.onload = () => { if (!cancelled) setSrc(full) }
    img.src = full
    return () => { cancelled = true }
  }, [item])

  return src
}

export default function ViewerMedia({
  item,
  active,
  layout,
  zoom,
  videoApiRef,
  onDoubleTap,
  burstKey,
}: ViewerMediaProps) {
  const isVideo = item.media_type === "video"
  const src = useProgressiveSrc(item)
  const { containerProps, attachMedia, mediaStyle, isZoomed, cursor } = zoom

  const onClick = useDoubleTap({
    onDoubleTap,
    // A single tap only means something on a video: play / pause.
    onSingleTap: () => {
      if (isVideo) videoApiRef.current?.togglePlay()
    },
  })

  // Off-screen slides (phone scroller) are inert: a still, no listeners, no
  // video element — which is what keeps exactly one video playing.
  if (!active) {
    return (
      <div className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isVideo ? posterSrc(item) || undefined : src}
          alt=""
          className={styles.still}
          draggable={false}
        />
      </div>
    )
  }

  return (
    <div
      {...containerProps}
      className={`${styles.media} ${styles.mediaActive} ${isZoomed ? styles.mediaZoomed : ""}`}
      style={{ cursor: isVideo ? "pointer" : cursor }}
      onClick={onClick}
      data-viewer-active=""
    >
      {isVideo ? (
        /* key: a slide change gets a fresh element, and unmounting the old
           one is what stops its audio. */
        <ViewerVideo
          key={item.id}
          item={item}
          apiRef={videoApiRef}
          controls={layout === "phone" ? "minimal" : "bar"}
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={attachMedia}
          src={src}
          alt=""
          className={styles.img}
          style={mediaStyle}
          draggable={false}
        />
      )}

      {burstKey > 0 && <LikeBurst key={burstKey} />}
    </div>
  )
}
