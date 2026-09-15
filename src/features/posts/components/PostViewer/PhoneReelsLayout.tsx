"use client"

/**
 * PhoneReelsLayout — the immersive phone viewer: black, 100dvh, one post per
 * screen in a vertical scroll-snap track, each post's slides in a horizontal
 * one, a right-hand action rail and the author + caption over a scrim. A
 * text-only post is a page too — its words on a dark card (ViewerTextPost)
 * in place of the slide track, no scrim, the author row without the text.
 *
 * The browser does both swipes. Which post is active is read back with an
 * IntersectionObserver rooted on the vertical track; which slide, off the
 * horizontal track's scrollLeft. A programmatic change (opening at the tapped
 * post, a keyboard key, the active post being deleted under the reader)
 * moves the track to match — instantly, before paint, so nothing animates
 * through the posts in between.
 *
 * Only the active post ±2 render real media; the rest are fixed-height
 * placeholders, so scroll positions stay correct however long the list gets.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { Icon } from "@iconify/react"
import type { Post } from "@/features/posts/services/posts.api"
import { useSoundStore } from "@/store/sound.store"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { burstKeyFor, type ViewerLayoutProps } from "./PostViewer"
import TailSlide from "./TailSlide"
import ViewerActions from "./ViewerActions"
import ViewerCaption from "./ViewerCaption"
import ViewerMedia, { type ZoomPan } from "./ViewerMedia"
import ViewerTextPost from "./ViewerTextPost"
import type { ViewerVideoApi } from "./ViewerVideo"
import styles from "./PostViewer.module.css"

/** Posts either side of the active one that render real media. */
const RENDER_WINDOW = 2

/** A page this visible is the active one. */
const ACTIVE_RATIO = 0.6

// ── One post (a page of the vertical track) ───────────────────

interface PhonePostPageProps {
  post: Post
  active: boolean
  /** Active page only: the slide state and gestures. */
  slide: number
  goToSlide: (next: number) => void
  zoom: ZoomPan
  videoApiRef: React.RefObject<ViewerVideoApi | null>
  burst: ViewerLayoutProps["burst"]
  onDoubleTapLike: () => void
  openComments: () => void
  openOptions: () => void
  queryParams: ViewerLayoutProps["queryParams"]
}

function PhonePostPage({
  post,
  active,
  slide,
  goToSlide,
  zoom,
  videoApiRef,
  burst,
  onDoubleTapLike,
  openComments,
  openOptions,
  queryParams,
}: PhonePostPageProps) {
  const media = useMemo(
    () => [...post.media].sort((a, b) => a.order - b.order),
    [post.media]
  )
  const isText = media.length === 0
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Slide a programmatic scroll is heading for; null while the user drives.
  const targetRef = useRef<number | null>(null)
  const firstLayoutRef = useRef(true)
  const frameRef = useRef<number | null>(null)
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const multi = media.length > 1

  // Keep the horizontal track on `slide`. Instant on mount (opening at slide
  // 3 must not animate from 0) and under reduced motion; smooth otherwise.
  useLayoutEffect(() => {
    if (!active) return
    const el = scrollerRef.current
    if (!el) return
    const width = el.clientWidth
    if (!width) return
    const shown = Math.round(el.scrollLeft / width)
    const instant = firstLayoutRef.current || reducedMotion
    firstLayoutRef.current = false
    if (shown === slide) return
    targetRef.current = slide
    el.scrollTo({ left: slide * width, behavior: instant ? "auto" : "smooth" })
  }, [active, slide, reducedMotion])

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
  }, [])

  const onScroll = useCallback(() => {
    if (!active || frameRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const el = scrollerRef.current
      if (!el || !el.clientWidth) return
      const shown = Math.round(el.scrollLeft / el.clientWidth)
      if (targetRef.current !== null) {
        // Our own scroll passing through the slides in between.
        if (shown !== targetRef.current) return
        targetRef.current = null
      }
      if (shown !== slide) goToSlide(shown)
    })
  }, [active, slide, goToSlide])

  // An inactive page shows its first slide only: a still, no track to swipe.
  const shownMedia = active ? media : media.slice(0, 1)

  return (
    <>
      {isText ? (
        /* The words ARE the page: no slide track, and no scrim — the card
           is dark already. */
        <ViewerTextPost
          post={post}
          layout="phone"
          active={active}
          onDoubleTap={onDoubleTapLike}
          burstKey={burstKeyFor(burst, post.id, 0)}
        />
      ) : (
        /* A pinch never swipes: useZoomPan default-prevents the two-finger
           touchmove (non-passive), which cancels both tracks' pans, and the
           zoom lets go when the fingers lift. */
        <div ref={scrollerRef} className={styles.track} onScroll={onScroll}>
          {shownMedia.map((item, i) => (
            <div key={item.id} className={styles.slide}>
              <ViewerMedia
                item={item}
                active={active && i === slide}
                layout="phone"
                zoom={zoom}
                videoApiRef={videoApiRef}
                onDoubleTap={onDoubleTapLike}
                burstKey={burstKeyFor(burst, post.id, i)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Bottom: scrim, author + caption, dots ── */}
      {!isText && <div className={styles.scrim} aria-hidden="true" />}

      <div className={styles.phoneBottom}>
        <ViewerCaption post={post} showText={!isText} />

        {active && multi && (
          <div className={styles.dots} role="tablist" aria-label="Slides">
            {media.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === slide}
                aria-label={`Go to ${i + 1}`}
                className={`${styles.dot} ${i === slide ? styles.dotActive : ""}`}
                onClick={() => goToSlide(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right rail ── */}
      <div className={styles.rail}>
        <ViewerActions
          post={post}
          queryParams={queryParams}
          variant="rail"
          onComment={openComments}
          onMore={openOptions}
        />
      </div>
    </>
  )
}

// ── The layout ────────────────────────────────────────────────

export default function PhoneReelsLayout({
  items,
  post,
  index,
  media,
  slide,
  goToSlide,
  zoom,
  videoApiRef,
  queryParams,
  burst,
  onDoubleTapLike,
  openComments,
  openOptions,
  requestClose,
  activatePost,
  tail,
  endLabel,
  onRetry,
  onLoadMore,
}: ViewerLayoutProps) {
  const listRef = useRef<HTMLDivElement>(null)
  // The post the observer last saw on screen. When the active id differs,
  // the change was programmatic and the track has to be moved to it.
  const observedIdRef = useRef<string | null>(null)
  const activatePostRef = useRef(activatePost)
  useEffect(() => { activatePostRef.current = activatePost })

  // Mute icon reads the GLOBAL state; the button drives the mounted video
  // (so the property lands in the same tick as the store) or, with no video
  // on this slide, just the store.
  const muted = useSoundStore((s) => s.muted)
  const toggleMuted = useSoundStore((s) => s.toggleMuted)

  // A text post has no media, so neither the counter nor the mute button
  // shows for it — the same rule, no special case.
  const current = media[slide]
  const isVideo = current?.media_type === "video"
  const multi = media.length > 1
  // The observer is rebuilt only when the SET of pages changes, not when a
  // like re-renders the same posts.
  const pagesKey = items.map((p) => p.id).join(",")

  // Put the track on the active post whenever the change did not come from
  // the reader's own scroll: opening (before first paint), a keyboard key,
  // or the post vanishing and the viewer re-targeting. Instant, always.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || index < 0) return
    if (observedIdRef.current === post.id) return
    const height = el.clientHeight
    if (!height) return
    el.scrollTop = index * height
    observedIdRef.current = post.id
  }, [post.id, index])

  // Which page is on screen → the active post.
  useEffect(() => {
    const root = listRef.current
    if (!root || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        let best: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < ACTIVE_RATIO) continue
          if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry
        }
        const id = (best?.target as HTMLElement | undefined)?.dataset.viewerPost
        // Same page as last reported (a rebuilt observer reports the current
        // page again): nothing changed, and activating it would reset the
        // slide the reader is on.
        if (!id || id === observedIdRef.current) return
        observedIdRef.current = id
        activatePostRef.current(id)
      },
      { root, threshold: [ACTIVE_RATIO] }
    )
    root.querySelectorAll<HTMLElement>("[data-viewer-post]").forEach((page) => observer.observe(page))
    return () => observer.disconnect()
  }, [pagesKey])

  const onMuteClick = () => {
    const api = videoApiRef.current
    if (api) api.toggleMute()
    else toggleMuted()
  }

  return (
    <div className={styles.phone}>
      {/* ── Posts ── */}
      <div ref={listRef} className={styles.vtrack}>
        {items.map((item, i) => {
          const near = Math.abs(i - index) <= RENDER_WINDOW
          return (
            <div key={item.id} className={styles.page} data-viewer-post={item.id}>
              {near && (
                <PhonePostPage
                  post={item}
                  active={item.id === post.id}
                  slide={slide}
                  goToSlide={goToSlide}
                  zoom={zoom}
                  videoApiRef={videoApiRef}
                  burst={burst}
                  onDoubleTapLike={onDoubleTapLike}
                  openComments={openComments}
                  openOptions={openOptions}
                  queryParams={queryParams}
                />
              )}
            </div>
          )
        })}

        {tail && (
          <TailSlide
            kind={tail}
            variant="page"
            endLabel={endLabel}
            onRetry={onRetry}
            onLoadMore={onLoadMore}
            onClose={requestClose}
          />
        )}
      </div>

      {/* ── Top bar (fixed; reads the active post) ── */}
      <div className={styles.phoneTop}>
        <button
          type="button"
          className={styles.phoneIconBtn}
          onClick={requestClose}
          aria-label="Close"
        >
          <Icon icon="mdi:close" width={24} height={24} />
        </button>

        {multi && (
          <span className={styles.phoneCounter} aria-live="polite">
            {slide + 1}/{media.length}
          </span>
        )}

        {isVideo ? (
          <button
            type="button"
            className={styles.phoneIconBtn}
            onClick={onMuteClick}
            aria-label={muted ? "Unmute video" : "Mute video"}
            aria-pressed={!muted}
          >
            <Icon icon={muted ? "mdi:volume-off" : "mdi:volume-high"} width={22} height={22} />
          </button>
        ) : (
          <span className={styles.phoneIconSpacer} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
