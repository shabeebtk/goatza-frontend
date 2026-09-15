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

type OpenState = { postId: string; slide: number } | null

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
  const [open, setOpen] = useState<OpenState>(null)
  // Set by the close callback, consumed by the effect once the viewer has
  // actually unmounted — landing must not race the scroll lock's release.
  const pendingLandRef = useRef<{ postId: string; slide: number } | null>(null)
  const land = usePostViewerStore((s) => s.land)

  // The viewer's ordering as of the PREVIOUS render, for a close that lands
  // on a post that is no longer there. Updated by an effect declared after
  // the landing effect below, so that one still sees the old ordering.
  const idsRef = useRef<string[]>([])

  const actions = useMemo<PostViewerActions>(
    () => ({ open: (postId, slide) => setOpen({ postId, slide }) }),
    []
  )

  const handleClose = useCallback(
    (lastPostId: string, lastSlide: number, reason: PostViewerCloseReason) => {
      setOpen(null)
      // A link was tapped: the page is changing, nothing to land on.
      if (reason === "navigate") return
      land(lastPostId, lastSlide)
      pendingLandRef.current = { postId: lastPostId, slide: lastSlide }
    },
    [land]
  )

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
    landOnPost(target, { highlight: true, slide })
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
