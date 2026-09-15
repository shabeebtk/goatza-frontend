import type { Post } from "@/features/posts/services/posts.api"

/**
 * One entry per post id, first occurrence wins, order kept.
 *
 * The home feed and Explore hand back a post twice now and then (the variety
 * pattern is best-effort: `seen_ids` caps at 30), and a cursor list can
 * repeat a row across a page boundary when something is inserted above it.
 * Rendered as-is that is two React children with one key; walked by the
 * full-screen viewer it is two pages for one post. Every list dedupes its
 * flattened pages through this before rendering, and the viewer derives its
 * own list from the same pass, so both agree on what is there and in what
 * order.
 */
export function dedupePosts(posts: Post[]): Post[] {
  const seen = new Set<string>()
  const out: Post[] = []
  for (const post of posts) {
    if (seen.has(post.id)) continue
    seen.add(post.id)
    out.push(post)
  }
  return out
}
