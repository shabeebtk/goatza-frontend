/**
 * viewerList — the list rules of the full-screen viewer, kept pure so they
 * can be pinned in a node test without a DOM.
 *
 * The viewer is handed the RAW list a feed renders (every post, in feed
 * order) and derives its own from it on every render: viewable posts only
 * (media, or non-blank text — see isViewablePost), deduped, with the active
 * post tracked by ID so a delete, a block or a refetch under it never lands
 * the reader on a different post by accident.
 */

import type { Post, PostMedia } from "@/features/posts/services/posts.api"
import { dedupePosts } from "@/features/posts/utils/dedupePosts"
import { isViewablePost } from "./textPost"

/** Only posts with something to show full screen; first occurrence wins. */
export function viewablePosts(posts: Post[]): Post[] {
  return dedupePosts(posts).filter(isViewablePost)
}

/**
 * The id to show once the list has changed under the reader.
 *
 * Still there → unchanged. Gone → the next post that survived, walking
 * forward from where it WAS in the previous ordering; the previous one when
 * it was last; null when nothing is left.
 */
export function nextActiveId(
  previousIds: readonly string[],
  currentIds: readonly string[],
  activeId: string
): string | null {
  if (currentIds.includes(activeId)) return activeId
  if (currentIds.length === 0) return null

  const survivors = new Set(currentIds)
  const at = previousIds.indexOf(activeId)
  if (at === -1) return currentIds[0]

  for (let i = at + 1; i < previousIds.length; i++) {
    if (survivors.has(previousIds[i])) return previousIds[i]
  }
  for (let i = at - 1; i >= 0; i--) {
    if (survivors.has(previousIds[i])) return previousIds[i]
  }
  return currentIds[0]
}

/** Fetch when the reader is this close to the last loaded viewable post. */
export const NEAR_END = 3

export function shouldFetchMore({
  index,
  count,
  hasNextPage,
  isFetchingNextPage,
  nearEnd = NEAR_END,
}: {
  index: number
  count: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  nearEnd?: number
}): boolean {
  if (!hasNextPage || isFetchingNextPage) return false
  if (index < 0) return false
  return count - 1 - index < nearEnd
}

/**
 * A fetched page can add nothing to the viewer — every post on it blank, or
 * already shown (the feed's variety pattern repeats posts across pages).
 * Rare now that text posts count, but fetching still keeps going on its own
 * for only this many empty pages in a row; after that the reader gets a
 * button.
 */
export const MAX_EMPTY_PAGES = 5

/** The streak after a fetch that added `added` viewable posts. */
export function emptyPageStreak(streak: number, added: number): number {
  return added > 0 ? 0 : streak + 1
}

export function autoFetchExhausted(streak: number, max = MAX_EMPTY_PAGES): boolean {
  return streak >= max
}

export type TailSlide = "loading" | "error" | "load-more" | "end" | null

/**
 * What to show after the last loaded post. Errors win (there is something
 * to retry), then the end of the list, then whatever the fetch state is.
 * `null` when there is no pagination at all (single-post mode).
 */
export function tailSlide({
  hasPagination,
  hasNextPage,
  isFetchingNextPage,
  isError,
  exhausted,
}: {
  hasPagination: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isError: boolean
  exhausted: boolean
}): TailSlide {
  if (!hasPagination) return null
  if (isError) return "error"
  if (!hasNextPage) return "end"
  if (isFetchingNextPage) return "loading"
  if (exhausted) return "load-more"
  // hasNextPage and idle: the auto-fetch is about to fire.
  return "loading"
}

// ── Warm neighbours ───────────────────────────────────────────

export type WarmPreload = "auto" | "metadata"

/** Media id → how much that slide's <video> should fetch while it waits. */
export type WarmPlan = Record<string, WarmPreload>

/** The most video elements the viewer keeps a source on, the active one included. */
export const MAX_VIEWER_VIDEOS = 4

export function sortedMedia(post: Post | undefined): PostMedia[] {
  return post ? [...post.media].sort((a, b) => a.order - b.order) : []
}

/**
 * Which video slides around the reader hold a real, loading element instead of
 * a still, soonest first so the limit cuts the least likely. The next slide
 * and the next post's first (preload auto), then on a phone the post after that
 * and the one before (metadata). Only a post's FIRST slide counts: that is the
 * one a swipe lands on. Empty under data saver.
 */
export function viewerWarmPlan(
  items: Post[],
  index: number,
  slide: number,
  { layout, saveData }: { layout: "phone" | "desktop"; saveData: boolean }
): WarmPlan {
  const plan: WarmPlan = {}
  if (saveData || index < 0) return plan

  const current = sortedMedia(items[index])
  const firstOf = (i: number) => sortedMedia(items[i])[0] as PostMedia | undefined

  const candidates: Array<[PostMedia | undefined, WarmPreload]> = [
    [current[slide + 1], "auto"],
    [firstOf(index + 1), "auto"],
  ]
  if (layout === "phone") {
    candidates.push([firstOf(index + 2), "metadata"], [firstOf(index - 1), "metadata"])
  }

  let holders = current[slide]?.media_type === "video" ? 1 : 0
  for (const [media, preload] of candidates) {
    if (media?.media_type !== "video" || holders >= MAX_VIEWER_VIDEOS) continue
    plan[media.id] = preload
    holders++
  }
  return plan
}
