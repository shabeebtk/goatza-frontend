"use client"

/**
 * ViewerMedia — one slide of the viewer: an image (with zoom on the active
 * slide) or a video. A video slide near the active one holds a real, paused
 * <video> (`warm`), and becoming active plays that SAME element: no remount, so
 * what it loaded is what plays. Further away it is a still.
 *
 * The tap comes from useDoubleTap: a single tap is held back ~250ms so a
 * double-tap can be a like without the first tap also pausing the video.
 * Images show the 640px copy immediately and swap to the full object once
 * it has loaded — the card already has the thumbnail cached, so the viewer
 * opens on something. On the active slide, MediaLoading says what is still on
 * its way: md while nothing has painted, sm over the thumb while the full image
 * loads.
 */

import { useEffect, useState, type RefObject } from "react"
import type { PostMedia } from "@/features/posts/services/posts.api"
import type { useZoomPan } from "@/features/posts/hooks/useZoomPan"
import MediaLoading from "@/shared/components/ui/MediaLoading/MediaLoading"
import { posterSrc, thumbSrc } from "@/shared/services/mediaDelivery"
import LikeBurst from "./LikeBurst"
import { useDoubleTap } from "./useDoubleTap"
import type { WarmPreload } from "./viewerList"
import ViewerVideo, { type ViewerVideoApi } from "./ViewerVideo"
import styles from "./ViewerMedia.module.css"

export type ZoomPan = ReturnType<typeof useZoomPan>

interface ViewerMediaProps {
  item: PostMedia
  /** The slide on screen: plays the video, takes the gestures. */
  active: boolean
  /** A video slide about to be wanted: hold a real element, this warm. */
  warm?: WarmPreload
  layout: "phone" | "desktop"
  zoom: ZoomPan
  videoApiRef: RefObject<ViewerVideoApi | null>
  /** Double-tap / double-click: like. */
  onDoubleTap: () => void
  /** Increment to replay the bolt burst. */
  burstKey: number
}

/**
 * The 640px copy first, the full object once the browser has it. `fullPending`:
 * a bigger copy exists and has neither arrived nor failed.
 */
function useProgressiveSrc(item: PostMedia): { src: string; fullPending: boolean } {
  const [src, setSrc] = useState(() => thumbSrc(item))
  const [fullFailed, setFullFailed] = useState(false)

  // Never for a video: file_url is the mp4, and fetching it as an image is a
  // wasted download that cannot succeed.
  const full = item.media_type === "image" ? item.file_url : ""
  const hasBetterCopy = Boolean(full) && full !== thumbSrc(item)

  useEffect(() => {
    if (!hasBetterCopy) return
    let cancelled = false
    const img = new Image()
    img.onload = () => { if (!cancelled) setSrc(full) }
    img.onerror = () => { if (!cancelled) setFullFailed(true) }
    img.src = full
    return () => { cancelled = true }
  }, [full, hasBetterCopy])

  return { src, fullPending: hasBetterCopy && src !== full && !fullFailed }
}

export default function ViewerMedia({
  item,
  active,
  warm,
  layout,
  zoom,
  videoApiRef,
  onDoubleTap,
  burstKey,
}: ViewerMediaProps) {
  const isVideo = item.media_type === "video"
  const { src, fullPending } = useProgressiveSrc(item)
  const { containerProps, attachMedia, mediaStyle, isZoomed, cursor } = zoom

  // Tracked on the still as well: a slide that loaded its thumb before it became
  // active is the same <img>, and has no load event left to fire.
  const [painted, setPainted] = useState(false)
  const [shownFailed, setShownFailed] = useState(false)
  const imageEvents = {
    onLoad: () => {
      setPainted(true)
      setShownFailed(false)
    },
    onError: () => setShownFailed(true),
  }
  // Painted: only the full image is left to wait for. Not painted: the image on
  // show has not failed yet, or a full one may still replace it.
  const photoLoading = painted ? fullPending : !shownFailed || fullPending

  const onClick = useDoubleTap({
    onDoubleTap,
    // A single tap only means something on a video: play / pause.
    onSingleTap: () => {
      if (isVideo) videoApiRef.current?.togglePlay()
    },
  })

  // Off-screen slides (phone scroller) are inert: a still, no listeners. Except
  // a video about to be wanted, which the branch below keeps warm.
  if (!active && !(isVideo && warm)) {
    return (
      <div className={styles.media}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={isVideo ? posterSrc(item) || undefined : src}
          alt=""
          className={styles.still}
          draggable={false}
          {...imageEvents}
        />
      </div>
    )
  }

  // The same element tree warm and active — the same <div>, the same keyed
  // ViewerVideo — which is what makes activating it reuse the <video>. Only
  // the gestures come and go.
  return (
    <div
      {...(active ? containerProps : {})}
      className={
        active
          ? `${styles.media} ${styles.mediaActive} ${isZoomed ? styles.mediaZoomed : ""}`
          : styles.media
      }
      style={active ? { cursor: isVideo ? "pointer" : cursor } : undefined}
      onClick={active ? onClick : undefined}
      data-viewer-active={active ? "" : undefined}
    >
      {isVideo ? (
        <ViewerVideo
          key={item.id}
          item={item}
          apiRef={videoApiRef}
          controls={layout === "phone" ? "minimal" : "bar"}
          active={active}
          warm={warm}
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
          {...imageEvents}
        />
      )}

      {!isVideo && <MediaLoading active={active && photoLoading} size={painted ? "sm" : "md"} />}

      {active && burstKey > 0 && <LikeBurst key={burstKey} />}
    </div>
  )
}
