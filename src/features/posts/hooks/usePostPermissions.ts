"use client"

/**
 * usePostPermissions — what the ACTIVE actor may do with a post.
 *
 * Lifted out of PostCard so the full-screen viewer and the card apply the
 * same rules and hand PostOptionsSheet the same props; two copies of "is this
 * mine?" is how one surface ends up offering Delete on a post the other
 * refuses to.
 */

import { useMemo } from "react"

import type { PostOptionsAuthor } from "@/features/posts/components/PostOptionsSheet/PostOptionsSheet"
import type { Post, PostMedia } from "@/features/posts/services/posts.api"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { useAuthStore } from "@/store/auth.store"

export interface PostPermissions {
  /** Editable / deletable: the active actor authored it. */
  isOwn: boolean
  /** Videos "Add to Highlights" may take. Empty ⇒ the option hides. */
  promotableVideos: PostMedia[]
  /** The author as PostOptionsSheet / ReportSheet / BlockConfirmSheet want it. */
  author: PostOptionsAuthor
}

export function usePostPermissions(post: Post): PostPermissions {
  const user = useAuthStore((s) => s.user)
  const actorType = useAuthStore((s) => s.actorType)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)

  // Non-null only on a public profile viewed logged out.
  const publicView = usePublicProfile()

  // A post is "own" (deletable/editable) when the ACTIVE actor authored it —
  // the user for their posts, or the active org for its posts. This mirrors the
  // backend, which deletes as the active actor. Never true for a visitor with
  // no session, whatever a stale store happens to hold.
  const isOwn =
    !publicView &&
    (post.author_type === "organization"
      ? actorType === "organization" && currentOrganization?.id === post.author.id
      : actorType === "user" && user?.id === post.author.id)

  // "Add to Highlights" is offered only for the author's OWN video posts, and
  // only to a player acting as themselves — highlights are personal, so an org
  // actor (even on a post it authored) never sees it. Empty ⇒ the option hides.
  const promotableVideos = useMemo(
    () =>
      post.author_type === "user" &&
      actorType === "user" &&
      user?.id === post.author.id &&
      user?.role === "player"
        ? post.media.filter((m) => m.media_type === "video")
        : [],
    [post.author_type, post.author.id, post.media, actorType, user?.id, user?.role]
  )

  const author = useMemo<PostOptionsAuthor>(
    () => ({
      id: post.author.id,
      username: post.author.username,
      name: post.author.name,
      // author_type is the server's string; anything not "organization"
      // is a person, which is also the safe default for old payloads.
      type: post.author_type === "organization" ? "organization" : "user",
    }),
    [post.author.id, post.author.username, post.author.name, post.author_type]
  )

  return { isOwn, promotableVideos, author }
}
