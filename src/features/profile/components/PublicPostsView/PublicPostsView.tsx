"use client"

/**
 * The standalone /posts page for a profile, in both viewer modes.
 *
 * Same branch as PublicProfileView: a signed-in visitor gets the normal
 * authenticated list (their follow state, their followers-only visibility);
 * an anonymous one gets the server-fetched public page seeded through the
 * public context, so PostsList renders it without firing its own query.
 *
 * `isLimited` is the third case: a MINOR's posts are not on the public surface
 * at all. The backend answers a well-formed page with zero results rather than
 * a 404 — the profile it belongs to still resolves, so a 404 would contradict
 * the page that linked here — which means without this flag the visitor would
 * get an "no posts yet" empty state that is simply untrue, and reads as either
 * a bug or as a claim about the player. A login wall says the real thing.
 */

import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import ProfileUnavailable from "@/features/profile/components/ProfileUnavailable/ProfileUnavailable"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"
import { PublicProfileProvider } from "@/features/profile/context/PublicProfileContext"
import type { PublicPostsPage } from "@/features/profile/services/publicProfile.api"
import { profilePath, type ProfileUrlKind } from "@/shared/services/profileUrl"
import { useAuthStore } from "@/store/auth.store"

export default function PublicPostsView({
  username,
  kind,
  displayName,
  posts,
  isLimited = false,
}: {
  username: string
  kind: ProfileUrlKind
  /** Name for the login wall's copy; falls back to the handle. */
  displayName: string
  /** Null when there is no public view — see the profile page's comment. */
  posts: PublicPostsPage | null
  /**
   * The profile's `is_limited_view` — true for a minor. Distinguishes "this
   * list is empty" from "this list is withheld", which the payload cannot,
   * because both arrive as zero results.
   */
  isLimited?: boolean
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null

  const body = (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <BackHeader title="Posts" />
      <PostsList
        username={username}
        type={kind === "organization" ? "organization" : "user"}
      />
    </div>
  )

  // A minor's posts. PublicRouteWall makes the same signed-in/anonymous split
  // as the lines below — a signed-in visitor still gets the real list from the
  // authenticated endpoint, because the withholding is a property of the
  // ANONYMOUS surface and not of the player.
  //
  // Says nothing about why. "This player is a minor" would restore, in one
  // line of copy, the age signal the backend serializer exists to remove.
  if (isLimited) {
    return (
      <PublicRouteWall
        title="Sign in to see posts"
        message={`Posts from ${displayName || username} are only visible to people on Goatza. Join to see them.`}
        nextPath={`${profilePath(username, kind)}/posts`}
      >
        {body}
      </PublicRouteWall>
    )
  }

  // Signed in — the authenticated list is the source of truth, whatever the
  // public endpoint said.
  if (isAuthenticated) return body

  if (!posts) {
    return (
      <ProfileUnavailable nextPath={`${profilePath(username, kind)}/posts`} />
    )
  }

  return (
    <PublicProfileProvider
      displayName={displayName || username}
      profilePath={`${profilePath(username, kind)}/posts`}
      sections={{ posts: posts.results }}
    >
      {body}
    </PublicProfileProvider>
  )
}
