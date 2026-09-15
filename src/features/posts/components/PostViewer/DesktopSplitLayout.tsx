"use client"

/**
 * DesktopSplitLayout — media on the left, the post on the right: header,
 * caption, stats, actions and the comments thread with its composer pinned.
 * A text-only post puts its words on the stage instead (ViewerTextPost) and
 * drops the panel's caption, which would repeat them.
 *
 * Posts are moved through with the up/down buttons, ↑/↓, or the wheel over
 * the media — one post per gesture, debounced, so a trackpad flick does not
 * skip five. Ctrl/⌘+wheel stays zoom (useZoomPan takes it first and
 * default-prevents it). Over a text box that can still scroll, the wheel is
 * the text's: ViewerTextPost stops it before it reaches the stage, and the
 * one-per-gesture rule applies again from the edge. The caption and the
 * thread are keyed by post so a new post starts them fresh; the composer is
 * what Comment focuses.
 */

import { useCallback, useRef } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { PostContent } from "@/features/posts/components/PostCard/PostCard"
import CommentsThread, {
  type CommentsThreadHandle,
} from "@/features/posts/components/PostComments/CommentsThread"
import { fmtCount } from "@/features/posts/utils/format"
import { getTopReactions } from "@/features/posts/utils/reactions"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { useNavigation } from "@/shared/services/navigation.service"
import { burstKeyFor, type ViewerLayoutProps } from "./PostViewer"
import TailSlide from "./TailSlide"
import ViewerActions from "./ViewerActions"
import ViewerMedia from "./ViewerMedia"
import ViewerTextPost from "./ViewerTextPost"
import styles from "./PostViewer.module.css"

dayjs.extend(relativeTime)

/** One post per wheel gesture: further ticks inside this window are the same gesture. */
const WHEEL_DEBOUNCE_MS = 350

/** Smaller deltas are trackpad noise, not a flick. */
const WHEEL_MIN_DELTA = 8

export default function DesktopSplitLayout({
  items,
  post,
  index,
  media,
  slide,
  goToSlide,
  zoom,
  videoApiRef,
  queryParams,
  isPostOwner,
  burst,
  onDoubleTapLike,
  openOptions,
  openLikes,
  requestClose,
  navigateAway,
  hasPrevPost,
  hasNextPost,
  goToPost,
  tail,
  endLabel,
  onRetry,
  onLoadMore,
}: ViewerLayoutProps) {
  const { toProfile } = useNavigation()
  const publicView = usePublicProfile()
  const threadRef = useRef<CommentsThreadHandle>(null)
  const lastWheelRef = useRef(0)

  const current = media[slide]
  const isText = media.length === 0
  const multi = media.length > 1
  const showNav = multi && !zoom.isZoomed
  const isLast = index === items.length - 1
  const hasList = items.length > 1 || tail !== null

  // Wheel over the media = next / previous post. Skipped while zoomed (the
  // wheel is then the image's), for Ctrl/⌘ (zoom took it), and for the
  // ticks that follow the first inside the debounce window.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.defaultPrevented || zoom.isZoomed) return
      if (Math.abs(e.deltaY) < WHEEL_MIN_DELTA) return
      const now = Date.now()
      if (now - lastWheelRef.current < WHEEL_DEBOUNCE_MS) return
      lastWheelRef.current = now
      goToPost(e.deltaY > 0 ? 1 : -1)
    },
    [zoom.isZoomed, goToPost]
  )
  const authorHref = toProfile(
    post.author.username,
    post.author_type === "organization" ? "organization" : "user"
  )
  const topReactions = getTopReactions(post.likes_breakdown)
  const timeAgo = dayjs(post.created_at).fromNow()

  // Comment: on desktop the thread is right there — put the cursor in it.
  const focusComposer = () => threadRef.current?.focusComposer()

  return (
    <div className={styles.desktop}>
      <div className={styles.modal}>
        {/* ── Media stage ── */}
        <div className={styles.stage} onWheel={onWheel}>
          {current && (
            <ViewerMedia
              key={current.id}
              item={current}
              active
              layout="desktop"
              zoom={zoom}
              videoApiRef={videoApiRef}
              onDoubleTap={onDoubleTapLike}
              burstKey={burstKeyFor(burst, post.id, slide)}
            />
          )}

          {isText && (
            /* Keyed: a new post's text box starts scrolled to the top. */
            <ViewerTextPost
              key={post.id}
              post={post}
              layout="desktop"
              active
              onDoubleTap={onDoubleTapLike}
              burstKey={burstKeyFor(burst, post.id, 0)}
            />
          )}

          {/* Prev / Next slide — hidden when zoomed */}
          {showNav && slide > 0 && (
            <button
              type="button"
              className={`${styles.slideNav} ${styles.slideNavPrev}`}
              onClick={() => goToSlide(slide - 1)}
              aria-label="Previous"
            >
              <Icon icon="mdi:chevron-left" width={28} height={28} />
            </button>
          )}
          {showNav && slide < media.length - 1 && (
            <button
              type="button"
              className={`${styles.slideNav} ${styles.slideNavNext}`}
              onClick={() => goToSlide(slide + 1)}
              aria-label="Next"
            >
              <Icon icon="mdi:chevron-right" width={28} height={28} />
            </button>
          )}

          {showNav && (
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

          {/* Where in the list */}
          {hasList && (
            <span className={styles.position} aria-live="polite">
              {index + 1} / {items.length}
            </span>
          )}

          {/* After the last loaded post: loading / error / load more / end */}
          {isLast && tail && (
            <TailSlide
              kind={tail}
              variant="panel"
              endLabel={endLabel}
              onRetry={onRetry}
              onLoadMore={onLoadMore}
              onClose={requestClose}
            />
          )}

          {/* Zoom indicator + reset */}
          {zoom.isZoomed && (
            <div className={styles.zoomChip}>
              <Icon icon="mdi:magnify" width={13} height={13} />
              {Math.round(zoom.scale * 100)}%
              <button
                type="button"
                className={styles.zoomResetBtn}
                onClick={zoom.resetZoom}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <aside className={styles.panel}>
          <header className={styles.panelHeader}>
            <Link href={authorHref} className={styles.panelAuthor}>
              <Avatar
                src={post.author.profile_photo || post.author.logo}
                initials={post.author.name?.slice(0, 2).toUpperCase()}
                size="md"
              />
              <span className={styles.panelAuthorInfo}>
                <span className={styles.panelAuthorName}>{post.author.name}</span>
                {post.author.headline && (
                  <span className={styles.panelAuthorHeadline}>{post.author.headline}</span>
                )}
                <span className={styles.panelMeta}>
                  <span>{timeAgo}</span>
                  {post.visibility === "followers" && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <Icon icon="mdi:account-group-outline" width={12} height={12} />
                    </>
                  )}
                  {post.location && (
                    <>
                      <span className={styles.metaDot}>·</span>
                      <Icon icon="mdi:map-marker-outline" width={12} height={12} />
                      <span className={styles.panelLocation}>
                        {post.location.name}
                        {post.location.country_code ? `, ${post.location.country_code}` : ""}
                      </span>
                    </>
                  )}
                </span>
              </span>
            </Link>

            {/* Every option needs an account — on a public profile the button
                opens the login wall rather than a sheet of dead options. */}
            <button
              type="button"
              className={styles.panelMoreBtn}
              aria-label="More options"
              onClick={
                publicView
                  ? () => publicView.openLoginWall("save posts from")
                  : openOptions
              }
            >
              <Icon icon="mdi:dots-horizontal" width={20} height={20} />
            </button>
          </header>

          {post.content && !isText && (
            /* Keyed: a new post's caption starts folded. Not for a text
               post: its words are on the stage already. */
            <div className={styles.panelCaption} key={post.id}>
              <PostContent text={post.content} mentions={post.mentions ?? []} />
            </div>
          )}

          {(post.likes_count > 0 || post.comments_count > 0) && (
            <div className={styles.statsRow}>
              {post.likes_count > 0 && (
                <button
                  type="button"
                  className={styles.likesBtn}
                  onClick={openLikes}
                  aria-label={`View ${post.likes_count} reactions`}
                >
                  <span className={styles.reactionIcons}>
                    {topReactions.length > 0 ? (
                      topReactions.map((r) => (
                        <span key={r.type} className={styles.reactionBubble} title={r.type}>
                          <Icon icon={r.icon} width={13} height={13} color={r.color} />
                        </span>
                      ))
                    ) : (
                      <span className={styles.reactionBubble}>
                        <Icon icon="mdi:lightning-bolt" width={11} height={11} color="var(--color-brand)" />
                      </span>
                    )}
                  </span>
                  <span>{fmtCount(post.likes_count)}</span>
                </button>
              )}
              {post.comments_count > 0 && (
                <span className={styles.statsComments}>
                  {fmtCount(post.comments_count)} comment{post.comments_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          <ViewerActions
            post={post}
            queryParams={queryParams}
            variant="panel"
            onComment={focusComposer}
          />

          <div className={styles.thread}>
            <CommentsThread
              key={post.id}
              ref={threadRef}
              postId={post.id}
              commentsCount={post.comments_count}
              isPostOwner={isPostOwner}
              onNavigate={navigateAway}
            />
          </div>
        </aside>
      </div>

      {/* ── Outside the modal ── */}
      <button
        type="button"
        className={styles.desktopClose}
        onClick={requestClose}
        aria-label="Close"
      >
        <Icon icon="mdi:close" width={26} height={26} />
      </button>

      {hasList && (
        <div className={styles.postNav}>
          <button
            type="button"
            className={styles.postNavBtn}
            onClick={() => goToPost(-1)}
            disabled={!hasPrevPost}
            aria-label="Previous post"
          >
            <Icon icon="mdi:chevron-up" width={28} height={28} />
          </button>
          <button
            type="button"
            className={styles.postNavBtn}
            onClick={() => goToPost(1)}
            disabled={!hasNextPost}
            aria-label="Next post"
          >
            <Icon icon="mdi:chevron-down" width={28} height={28} />
          </button>
        </div>
      )}
    </div>
  )
}
