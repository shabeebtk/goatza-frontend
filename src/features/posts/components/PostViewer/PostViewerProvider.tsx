"use client"

/**
 * PostViewerProvider — lets every card in a list open the full-screen viewer
 * on THAT list: swiping moves through the list's posts, more pages load into
 * the list's own cache, and closing lands the list on the last post viewed.
 *
 * Two contexts on purpose. Cards read only the ACTIONS context (`open`),
 * whose value never changes — the list state (posts, pagination) lives in
 * this component and goes straight to the viewer. Otherwise every memoized
 * PostCard would re-render each time a page loaded.
 *
 * A card outside any provider (profile, saved, search, the single post page)
 * falls back to the single-post viewer PostCard renders itself.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { FetchPostsParams, Post } from "@/features/posts/services/posts.api"
import { landOnPost } from "@/features/posts/utils/landOnPost"
import { clearRestoreState, readRestoreState } from "@/shared/hooks/useBackToClose"
import { usePostViewerStore } from "@/store/postViewer.store"
import PostViewer, { type PostViewerCloseReason } from "./PostViewer"
import { viewablePosts, nextActiveId } from "./viewerList"

export interface PostViewerActions {
  /** Open the viewer on `postId`, at its `slideIndex`-th media item. */
  open: (postId: string, slideIndex: number) => void
}

const PostViewerActionsContext = createContext<PostViewerActions | null>(null)

/** The list's viewer, or null when this card is not inside a provider. */
export function usePostViewer(): PostViewerActions | null {
  return useContext(PostViewerActionsContext)
}

interface PostViewerProviderProps {
  posts: Post[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /**
   * The list's own fetchNextPage, wrapped with `{ cancelRefetch: false }`:
   * the list's sentinel and the viewer both ask, and the default would cancel
   * the request in flight and start it over. Returning the query's promise
   * lets the viewer's fetch guard clear when it settles.
   */
  fetchNextPage: () => unknown
  isError?: boolean
  /** Impressions for posts read full screen (the feed's markSeen). */
  onPostSeen?: (postId: string) => void
  /** The end slide's button: "Back to feed", "Back to explore". */
  endLabel?: string
  /** Forwarded to the like mutation, as the list's cards do. */
  queryParams?: FetchPostsParams
  /**
   * True → the cards get no list viewer and fall back to their own single-post
   * one. For a list that renders a subset of its query (the profile tab's
   * one-post preview), where a viewer walking the full query would close on a
   * post the list never shows.
   */
  disabled?: boolean
  children: ReactNode
}

type OpenState = {
  postId: string
  slide: number
  /**
   * The viewer was reopened from a history entry it had left behind, rather
   * than opened by a tap. It adopts that entry instead of pushing another.
   */
  restored?: boolean
} | null

/** The shape the viewer writes onto its history entry. */
type RestorePayload = { postId: string; slide: number }

function asRestorePayload(value: unknown): RestorePayload | null {
  if (typeof value !== "object" || value === null) return null
  const { postId, slide } = value as { postId?: unknown; slide?: unknown }
  if (typeof postId !== "string" || typeof slide !== "number") return null
  return { postId, slide }
}

/**
 * THE VIEWER THE READER LEFT, if this entry is carrying one and the list can
 * still show it.
 *
 * The post may be gone (deleted, blocked, or simply not in this list's
 * cache any more), so the same fallback a change under the reader uses
 * applies: the nearest survivor. With no previous ordering to walk, that
 * resolves to the first viewable post — better than nothing, and the slide
 * only means anything on the post it was read on.
 *
 * An empty list is the reload case: the page came back with no cache and
 * the first page has not arrived. There is nothing to reopen onto, and a
 * viewer with no post is worse than no viewer, so the payload is dropped
 * and the reader gets the list.
 */
function restoreFrom(posts: Post[]): OpenState {
  const payload = asRestorePayload(readRestoreState())
  if (!payload) return null

  const ids = viewablePosts(posts).map((p) => p.id)
  if (ids.length === 0) return null

  const target = nextActiveId([], ids, payload.postId)
  if (!target) return null

  return {
    postId: target,
    slide: target === payload.postId ? payload.slide : 0,
    restored: true,
  }
}

export default function PostViewerProvider({
  posts,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isError = false,
  onPostSeen,
  endLabel = "Back to feed",
  queryParams,
  disabled = false,
  children,
}: PostViewerProviderProps) {
  /**
   * COMING BACK FROM A PROFILE the reader tapped through to.
   *
   * Read during the first render, not in an effect: the entry already says
   * the viewer was open, and an effect would paint the list for a frame
   * first — the flash this whole mechanism exists to avoid. `posts` is the
   * list's React Query cache, which on a client-side back is already warm,
   * so the post is there to reopen on.
   */
  const [open, setOpen] = useState<OpenState>(() => restoreFrom(posts))
  // Set by the close callback, consumed by the effect once the viewer has
  // actually unmounted — landing must not race the scroll lock's release.
  const pendingLandRef = useRef<{ postId: string; slide: number } | null>(null)
  const land = usePostViewerStore((s) => s.land)

  // The viewer's ordering as of the PREVIOUS render, for a close that lands
  // on a post that is no longer there. Updated by an effect declared after
  // the landing effect below, so that one still sees the old ordering.
  const idsRef = useRef<string[]>([])

  // The live list, for the popstate listener — which is registered once and
  // must not close over the first render's posts.
  const postsRef = useRef(posts)
  useEffect(() => { postsRef.current = posts })

  /**
   * A payload this page cannot honour — the reload case: the reader came
   * back to an entry that says a viewer was open, but the list arrived with
   * no cache behind it and there is nothing to reopen onto. Dropping it is
   * what stops it springing the viewer open later, once a page has loaded,
   * long after the press that would have explained it.
   *
   * Mount only, and only when the first render already decided not to
   * restore (clearing it from the render itself would be a side effect in
   * render, and StrictMode would do it twice).
   */
  useEffect(() => {
    if (!open && readRestoreState()) clearRestoreState()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  const actions = useMemo<PostViewerActions>(
    () => ({ open: (postId, slide) => setOpen({ postId, slide }) }),
    []
  )

  const handleClose = useCallback(
    (lastPostId: string, lastSlide: number, reason: PostViewerCloseReason) => {
      setOpen(null)
      // A link was tapped: the page is changing, nothing to land on. (The
      // viewer SUSPENDS on a link now rather than closing, so this is the
      // belt to that braces — nothing should reach it.)
      if (reason === "navigate") return
      land(lastPostId, lastSlide)
      pendingLandRef.current = { postId: lastPostId, slide: lastSlide }
    },
    [land]
  )

  /**
   * BACK AND FORWARD, while this page stays mounted.
   *
   * Two cases, and the entry answers both. Landing on an entry that carries
   * a viewer reopens it — coming back from a profile when the page was kept
   * alive, or a forward press onto a viewer the reader backed out of.
   * Landing on one that does not takes the viewer away: that is the second
   * back press, and it must not leave an overlay standing over the list.
   *
   * The close CALLBACK is not involved either way — on a real close
   * useBackToClose has already run it before this hears the same popstate,
   * and setOpen(null) twice is setOpen(null).
   */
  useEffect(() => {
    const onPopState = () => {
      const restored = restoreFrom(postsRef.current)
      setOpen((current) => {
        if (!restored) return current ? null : current
        // Already showing exactly that: keep the SAME object. A new one
        // would change the viewer's props for no reason, and its history
        // hook would tear down and re-register an entry that never moved.
        if (current && current.postId === restored.postId && current.slide === restored.slide) {
          return current
        }
        return restored
      })
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  // After the viewer has unmounted (and released the body scroll lock): put
  // the list on the post the reader was looking at — however deep, including
  // pages that loaded inside the viewer, since they share this list's cache.
  useEffect(() => {
    const pending = pendingLandRef.current
    if (open || !pending) return
    pendingLandRef.current = null
    const currentIds = viewablePosts(posts).map((p) => p.id)
    const target = currentIds.includes(pending.postId)
      ? pending.postId
      : nextActiveId(idsRef.current, currentIds, pending.postId)
    if (!target) return
    // The slide only means something on the post it was read on; a stand-in
    // post starts at its first.
    const slide = target === pending.postId ? pending.slide : 0
    // No highlight flash: the landing itself says where the reader is, and
    // the brand outline read as a broken border on the card.
    landOnPost(target, { slide })
  }, [open, posts])

  useEffect(() => {
    idsRef.current = viewablePosts(posts).map((p) => p.id)
  })

  if (disabled) return <>{children}</>

  return (
    <PostViewerActionsContext.Provider value={actions}>
      {children}
      {open && (
        <PostViewer
          posts={posts}
          initialPostId={open.postId}
          initialSlide={open.slide}
          restored={open.restored}
          onClose={handleClose}
          pagination={{ hasNextPage, isFetchingNextPage, fetchNextPage, isError }}
          onPostSeen={onPostSeen}
          endLabel={endLabel}
          queryParams={queryParams}
        />
      )}
    </PostViewerActionsContext.Provider>
  )
}
