/**
 * viewerList — the list rules of the full-screen viewer, kept pure so they
 * can be pinned in a node test without a DOM.
 *
 * The viewer is handed the RAW list a feed renders (every post, in feed
 * order) and derives its own from it on every render: media posts only,
 * deduped, with the active post tracked by ID so a delete, a block or a
 * refetch under it never lands the reader on a different post by accident.
 */

import type { Post } from "@/features/posts/services/posts.api"

/** Only posts with something to show full screen; first occurrence wins. */
export function mediaPosts(posts: Post[]): Post[] {
  const seen = new Set<string>()
  const out: Post[] = []
  for (const post of posts) {
    if (post.media.length === 0 || seen.has(post.id)) continue
    seen.add(post.id)
    out.push(post)
  }
  return out
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

/** Fetch when the reader is this close to the last loaded media post. */
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
 * The feed's page size is 15 and text-only posts are dropped, so a fetched
 * page can add nothing to the viewer. Fetching keeps going on its own for
 * this many empty pages in a row; after that the reader gets a button.
 */
export const MAX_EMPTY_PAGES = 5

/** The streak after a fetch that added `added` media posts. */
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
