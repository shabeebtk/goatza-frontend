"use client"

/**
 * PostViewer — the full-screen post: reels-style on a phone, a split panel
 * (media + comments) on desktop, moving through the LIST it was opened from.
 *
 * Replaces the media-only lightbox MediaCarousel used to own. It renders the
 * live `Post` objects it is handed and never copies them into state: every
 * like, save and comment count is the React Query cache's, so the card
 * underneath is already right when this closes — and pages fetched from in
 * here land in the same cache, so the list has them too.
 *
 * The active post is tracked by ID, never by index. The list can change
 * under the reader (a delete, a block, a refetch after a failed mutation);
 * viewerList.ts decides where to go when the active post disappears.
 *
 * What lives here: the portal + dialog, the history entry (back closes the
 * viewer, and only the top-most sheet when one is open), the scroll lock,
 * focus in/out, the keyboard, pagination, and the sheets a post can open
 * (comments, options, edit, likes). Everything visual is in the two layouts.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import PostComments from "@/features/posts/components/PostComments/PostComments"
import PostOptionsSheet from "@/features/posts/components/PostOptionsSheet/PostOptionsSheet"
import PostLikesModal from "@/features/posts/components/PostLikesModal/PostLikesModal"
import EditPostModal from "@/features/posts/components/EditPostModal/EditPostModal"
import { usePostPermissions } from "@/features/posts/hooks/usePostPermissions"
import { useToggleLike } from "@/features/posts/hooks/usePostMutations"
import { useZoomPan } from "@/features/posts/hooks/useZoomPan"
import type { FetchPostsParams, Post, PostMedia } from "@/features/posts/services/posts.api"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { posterSrc } from "@/shared/services/mediaDelivery"
import { usePostViewerStore } from "@/store/postViewer.store"
import DesktopSplitLayout from "./DesktopSplitLayout"
import PhoneReelsLayout from "./PhoneReelsLayout"
import type { ZoomPan } from "./ViewerMedia"
import type { ViewerVideoApi } from "./ViewerVideo"
import {
  autoFetchExhausted,
  emptyPageStreak,
  mediaPosts,
  nextActiveId,
  shouldFetchMore,
  tailSlide,
  type TailSlide,
} from "./viewerList"
import styles from "./PostViewer.module.css"

/** Same breakpoint as AppShell: the top bar turns into the desktop nav here. */
const DESKTOP_QUERY = "(min-width: 768px)"

/** A post counts as read once it has been the active one this long. */
const SEEN_MS = 1000

const EMPTY_QUERY_PARAMS: FetchPostsParams = {}

export interface PostViewerPagination {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  isError?: boolean
}

/** Why the viewer closed — a link tap changes the page, so nothing lands. */
export type PostViewerCloseReason = "close" | "navigate"

export interface PostViewerProps {
  /** The list the viewer moves through. Live cache objects, never copies. */
  posts: Post[]
  initialPostId: string
  initialSlide?: number
  /** Where the reader got to, so the caller can land the list there. */
  onClose: (lastPostId: string, lastSlide: number, reason: PostViewerCloseReason) => void
  /** Fetched when the reader nears the end of the loaded media posts. */
  pagination?: PostViewerPagination
  /** Fires once a post has been active for a second. */
  onPostSeen?: (postId: string) => void
  /** The end slide's button — "Back to feed", "Back to explore". */
  endLabel?: string
  /** Forwarded to the like mutation, as PostCard does for PostActions. */
  queryParams?: FetchPostsParams
  /** Profile preview list — deletes refetch rather than filter (PostOptionsSheet). */
  isPreview?: boolean
}

/** Everything a layout needs; both layouts take exactly this. */
export interface ViewerLayoutProps {
  /** The media posts of the list, in order. */
  items: Post[]
  post: Post
  index: number
  /** The active post's media, in display order. */
  media: PostMedia[]
  slide: number
  goToSlide: (next: number) => void
  zoom: ZoomPan
  videoApiRef: RefObject<ViewerVideoApi | null>
  queryParams: FetchPostsParams
  isPostOwner: boolean
  /** Bumped per double-tap; ViewerMedia replays the bolt on change. */
  burstKey: number
  onDoubleTapLike: () => void
  openComments: () => void
  openOptions: () => void
  openLikes: () => void
  requestClose: () => void
  navigateAway: (href: string) => void
  /** Make `id` the active post (the phone's observer, desktop's nav). */
  activatePost: (id: string) => void
  goToPost: (delta: 1 | -1) => void
  hasPrevPost: boolean
  hasNextPost: boolean
  tail: TailSlide
  endLabel: string
  onRetry: () => void
  onLoadMore: () => void
}

type Sheet = "comments" | "options" | "edit" | "likes" | null

/** Shortcuts stay out of anything the user types into. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== "function") return false
  return Boolean(
    el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
  )
}

/**
 * True when no other modal sits above `el`. Every sheet and modal in the app
 * is an `aria-modal` portal appended to <body> when it opens, so the last one
 * in document order is the one on top — including the login wall, which is
 * rendered by a provider outside this tree.
 */
function isTopmostDialog(el: HTMLElement | null): boolean {
  if (!el) return false
  const dialogs = document.querySelectorAll('[aria-modal="true"]')
  return dialogs[dialogs.length - 1] === el
}

function isModifiedClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export default function PostViewer({
  posts,
  initialPostId,
  initialSlide = 0,
  onClose,
  pagination,
  onPostSeen,
  endLabel = "Back to feed",
  queryParams = EMPTY_QUERY_PARAMS,
  isPreview = false,
}: PostViewerProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  // ── The list, and where we are in it ────────────────────────
  const items = useMemo(() => mediaPosts(posts), [posts])
  const ids = useMemo(() => items.map((p) => p.id), [items])

  const [activePostId, setActivePostId] = useState(initialPostId)
  const [slide, setSlide] = useState(initialSlide)

  // The ordering as of the last render. When it changes and the active post
  // is no longer in it, re-target during render (React's "adjust state on a
  // prop change" pattern) so no frame ever shows a post that is gone.
  const [knownIds, setKnownIds] = useState(ids)
  if (knownIds !== ids && !sameIds(knownIds, ids)) {
    setKnownIds(ids)
    if (!ids.includes(activePostId)) {
      const next = nextActiveId(knownIds, ids, activePostId)
      if (next) {
        setActivePostId(next)
        setSlide(0)
      }
    }
  }

  const index = ids.indexOf(activePostId)
  const post: Post | undefined = index >= 0 ? items[index] : undefined

  const activatePost = useCallback((id: string) => {
    setActivePostId(id)
    setSlide(0)
  }, [])

  // ── History / scroll lock / focus ───────────────────────────
  // Where the reader is, readable from the one-shot close callback.
  const positionRef = useRef({ postId: activePostId, slide })
  useEffect(() => { positionRef.current = { postId: activePostId, slide } })
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  // Set before navigateAway pops the overlay stack, so the close that
  // follows knows the page is about to change.
  const leavingRef = useRef(false)

  const handleClose = useCallback(() => {
    onCloseRef.current(
      positionRef.current.postId,
      positionRef.current.slide,
      leavingRef.current ? "navigate" : "close"
    )
  }, [])

  // Reserve ONE history entry so the back button/gesture closes the viewer
  // instead of navigating away; a sheet opened on top reserves its own, so
  // back there closes only the sheet. URL never changes.
  const { requestClose, navigateAway } = useBackToClose(handleClose)
  useBodyScrollLock()

  // Tell the inline carousels a viewer is up, so their videos pause.
  const setViewerOpen = usePostViewerStore((s) => s.setOpen)
  useEffect(() => {
    setViewerOpen(true)
    return () => setViewerOpen(false)
  }, [setViewerOpen])

  const leave = useCallback(
    (href: string) => {
      leavingRef.current = true
      navigateAway(href)
    },
    [navigateAway]
  )

  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Move focus in so Esc and the arrow keys work without a click first.
    dialogRef.current?.focus()
    return () => {
      // Back to the tile that opened this — a keyboard user should land
      // exactly where they were.
      previouslyFocused?.focus?.()
    }
  }, [])

  // Nothing left to show (every media post deleted or blocked) — leave. In
  // single-post mode the card unmounts this first.
  useEffect(() => {
    if (!post) requestClose()
  }, [post, requestClose])

  // Read = active for a full second. Swiping straight past is not reading.
  const onPostSeenRef = useRef(onPostSeen)
  useEffect(() => { onPostSeenRef.current = onPostSeen })
  const postId = post?.id
  useEffect(() => {
    if (!postId) return
    const timer = window.setTimeout(() => onPostSeenRef.current?.(postId), SEEN_MS)
    return () => window.clearTimeout(timer)
  }, [postId])

  // ── Pagination ──────────────────────────────────────────────
  const hasNextPage = pagination?.hasNextPage ?? false
  const isFetchingNextPage = pagination?.isFetchingNextPage ?? false
  const isError = pagination?.isError ?? false
  const fetchNextPage = pagination?.fetchNextPage

  // Pages that added no media post, in a row. Derived from the fetch flag
  // flipping (during render again), so the tail can switch to "Load more"
  // without an effect setting state.
  const [wasFetching, setWasFetching] = useState(isFetchingNextPage)
  const [countBeforeFetch, setCountBeforeFetch] = useState(items.length)
  const [emptyStreak, setEmptyStreak] = useState(0)
  if (wasFetching !== isFetchingNextPage) {
    setWasFetching(isFetchingNextPage)
    if (isFetchingNextPage) {
      setCountBeforeFetch(items.length)
    } else {
      setEmptyStreak((s) => emptyPageStreak(s, items.length - countBeforeFetch))
    }
  }
  const exhausted = autoFetchExhausted(emptyStreak)

  // One request per approach to the end: set when we ask, cleared once the
  // fetch is under way. Covers StrictMode's double effect and a run of fast
  // swipes before the flag has flipped.
  const requestedRef = useRef(false)
  useEffect(() => {
    if (isFetchingNextPage) requestedRef.current = false
  }, [isFetchingNextPage])

  useEffect(() => {
    // An error waits for "Try again"; five empty pages wait for "Load more".
    if (!fetchNextPage || isError || exhausted) return
    if (!shouldFetchMore({ index, count: items.length, hasNextPage, isFetchingNextPage })) return
    if (requestedRef.current) return
    requestedRef.current = true
    fetchNextPage()
  }, [fetchNextPage, isError, exhausted, index, items.length, hasNextPage, isFetchingNextPage])

  const onRetry = useCallback(() => {
    requestedRef.current = true
    fetchNextPage?.()
  }, [fetchNextPage])

  const onLoadMore = useCallback(() => {
    setEmptyStreak(0)
    requestedRef.current = true
    fetchNextPage?.()
  }, [fetchNextPage])

  const tail = tailSlide({
    hasPagination: Boolean(pagination),
    hasNextPage,
    isFetchingNextPage,
    isError,
    exhausted,
  })

  // Warm the next post's first frame so a swipe lands on a picture.
  useEffect(() => {
    const next = items[index + 1]?.media
    if (!next || next.length === 0) return
    const first = [...next].sort((a, b) => a.order - b.order)[0]
    const src = first.media_type === "video" ? posterSrc(first) : first.file_url
    if (!src) return
    const img = new Image()
    img.src = src
  }, [items, index])

  // ── Links: leave through the overlay stack ───────────────────
  // Author, hashtag, mention and comment-author links all render as <Link>.
  // Captured here (portals still bubble through the React tree, so the
  // comments sheet's links arrive too) and routed through navigateAway, which
  // pops every overlay entry before pushing — back from the profile then
  // returns to the list, not to a blank viewer entry.
  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
    if (!anchor || e.defaultPrevented || isModifiedClick(e)) return
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return
    e.preventDefault()
    leave(url.pathname + url.search + url.hash)
  }

  // Only ever mounted from a tap, so the document exists by then; the guard
  // is for the server pass, where it does not.
  if (typeof document === "undefined" || !post) return null

  return createPortal(
    <div
      ref={dialogRef}
      className={`${styles.root} ${isDesktop ? styles.rootDesktop : styles.rootPhone}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Post by ${post.author.name}`}
      tabIndex={-1}
      onClickCapture={onClickCapture}
    >
      <PostViewerBody
        post={post}
        items={items}
        index={index}
        slide={slide}
        setSlide={setSlide}
        activatePost={activatePost}
        isDesktop={isDesktop}
        dialogRef={dialogRef}
        queryParams={queryParams}
        isPreview={isPreview}
        requestClose={requestClose}
        navigateAway={leave}
        tail={tail}
        endLabel={endLabel}
        onRetry={onRetry}
        onLoadMore={onLoadMore}
      />
    </div>,
    document.body
  )
}

// ── Body: everything that needs a post ────────────────────────

interface PostViewerBodyProps {
  post: Post
  items: Post[]
  index: number
  slide: number
  setSlide: (next: number) => void
  activatePost: (id: string) => void
  isDesktop: boolean
  dialogRef: RefObject<HTMLDivElement | null>
  queryParams: FetchPostsParams
  isPreview: boolean
  requestClose: () => void
  navigateAway: (href: string) => void
  tail: TailSlide
  endLabel: string
  onRetry: () => void
  onLoadMore: () => void
}

function PostViewerBody({
  post,
  items,
  index,
  slide,
  setSlide,
  activatePost,
  isDesktop,
  dialogRef,
  queryParams,
  isPreview,
  requestClose,
  navigateAway,
  tail,
  endLabel,
  onRetry,
  onLoadMore,
}: PostViewerBodyProps) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [burstKey, setBurstKey] = useState(0)

  const media = useMemo(
    () => [...post.media].sort((a, b) => a.order - b.order),
    [post.media]
  )
  const safeSlide = Math.max(0, Math.min(slide, media.length - 1))
  const current = media[safeSlide] as PostMedia | undefined
  const isImage = current?.media_type === "image"

  // Non-null only while a video slide is mounted — which is exactly the
  // condition the keyboard handler needs to decide what an arrow key means.
  const videoApiRef = useRef<ViewerVideoApi | null>(null)

  // One zoom for the active slide. Double-tap is the like, so zoom keeps
  // pinch / Ctrl+wheel / drag only; on a phone it lets go with the fingers.
  const zoom = useZoomPan({
    enabled: isImage,
    wheelMode: "ctrl-zoom",
    doubleTapZoom: false,
    snapBack: !isDesktop,
  })
  const { resetZoom } = zoom

  // A different post is up: zoom back to 1×, any sheet closed. The slide was
  // reset by whoever changed the post; the caption and the comment thread
  // are keyed by post id in the layouts.
  const [shownPostId, setShownPostId] = useState(post.id)
  if (shownPostId !== post.id) {
    setShownPostId(post.id)
    setSheet(null)
    resetZoom()
  }

  const { isOwn, promotableVideos, author } = usePostPermissions(post)
  const publicView = usePublicProfile()
  const like = useToggleLike(queryParams)

  /** Change slide. Resets zoom, always — one setter so nothing can forget. */
  const goToSlide = useCallback(
    (next: number) => {
      setSlide(Math.max(0, Math.min(next, media.length - 1)))
      resetZoom()
    },
    [media.length, resetZoom, setSlide]
  )

  const hasPrevPost = index > 0
  const hasNextPost = index < items.length - 1

  const goToPost = useCallback(
    (delta: 1 | -1) => {
      const next = items[index + delta]
      if (next) activatePost(next.id)
    },
    [items, index, activatePost]
  )

  // Double-tap / double-click on the media. The like API is a toggle, so it
  // is only called when the post is NOT already reacted; otherwise just the
  // burst, which is what every double-tap in every app does.
  const onDoubleTapLike = useCallback(() => {
    if (publicView) {
      publicView.openLoginWall("react to posts from")
      return
    }
    setBurstKey((k) => k + 1)
    if (post.reaction?.is_reacted || like.isPending) return
    like.mutate({ post_id: post.id, type: "like" })
  }, [publicView, post.id, post.reaction?.is_reacted, like])

  const openComments = useCallback(() => setSheet("comments"), [])
  const openOptions = useCallback(() => setSheet("options"), [])
  const openLikes = useCallback(() => setSheet("likes"), [])
  const closeSheet = useCallback(() => setSheet(null), [])

  // ── Keyboard ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Typing a comment must never pause or mute the video.
      if (isTypingTarget(e.target)) return
      // A sheet on top owns the keyboard (its own Esc closes it).
      if (!isTopmostDialog(dialogRef.current)) return

      if (e.key === "Escape") {
        e.preventDefault()
        if (zoom.isZoomed) resetZoom()
        else requestClose()
        return
      }

      if (e.key === "Tab") {
        // Focus trap — keep Tab inside the overlay.
        const root = dialogRef.current
        if (!root) return
        const focusable = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, textarea, select, video, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
        return
      }

      // Video slide → the arrows mean "seek", not "next photo". Images keep
      // navigating exactly as before.
      const video = videoApiRef.current
      if (video) {
        if (e.key === " " || e.key === "k" || e.key === "K") {
          e.preventDefault()   // also stops the page scrolling on Space
          video.togglePlay()
          return
        }
        if (e.key === "m" || e.key === "M") { video.toggleMute(); return }
        if (e.key === "ArrowRight") { e.preventDefault(); video.seekBy(5); return }
        if (e.key === "ArrowLeft") { e.preventDefault(); video.seekBy(-5); return }
      }

      if (e.key === "ArrowRight" && !zoom.isZoomed) goToSlide(safeSlide + 1)
      if (e.key === "ArrowLeft" && !zoom.isZoomed) goToSlide(safeSlide - 1)
      if (e.key === "ArrowDown") { e.preventDefault(); goToPost(1) }
      if (e.key === "ArrowUp") { e.preventDefault(); goToPost(-1) }
      if (e.key === "+" || e.key === "=") zoom.zoomBy(1)
      if (e.key === "-") zoom.zoomBy(-1)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [dialogRef, zoom, resetZoom, requestClose, goToSlide, goToPost, safeSlide])

  const layoutProps: ViewerLayoutProps = {
    items,
    post,
    index,
    media,
    slide: safeSlide,
    goToSlide,
    zoom,
    videoApiRef,
    queryParams,
    isPostOwner: isOwn,
    burstKey,
    onDoubleTapLike,
    openComments,
    openOptions,
    openLikes,
    requestClose,
    navigateAway,
    activatePost,
    goToPost,
    hasPrevPost,
    hasNextPost,
    tail,
    endLabel,
    onRetry,
    onLoadMore,
  }

  return (
    <>
      {isDesktop ? (
        <DesktopSplitLayout {...layoutProps} />
      ) : (
        <PhoneReelsLayout {...layoutProps} />
      )}

      {/* ── Sheets above the viewer (each is its own portal + z-index) ── */}
      {sheet === "comments" && (
        <PostComments
          postId={post.id}
          commentsCount={post.comments_count}
          isPostOwner={isOwn}
          onClose={closeSheet}
        />
      )}

      {sheet === "options" && (
        <PostOptionsSheet
          postId={post.id}
          isOwn={isOwn}
          isPreview={isPreview}
          isSaved={post.is_saved ?? false}
          promotableVideos={promotableVideos}
          onClose={closeSheet}
          onEdit={() => setSheet("edit")}
          author={author}
        />
      )}

      {sheet === "edit" && (
        <EditPostModal post={post} onClose={closeSheet} />
      )}

      {sheet === "likes" && (
        <PostLikesModal
          postId={post.id}
          totalCount={post.likes_count}
          onClose={closeSheet}
        />
      )}
    </>
  )
}
