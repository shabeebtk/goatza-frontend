"use client"

/**
 * The standalone /posts page for a profile, in both viewer modes.
 *
 * Same branch as PublicProfileView: a signed-in visitor gets the normal
 * authenticated list (their follow state, their followers-only visibility);
 * an anonymous one gets the server-fetched public page seeded through the
 * public context, so PostsList renders it without firing its own query.
 */

import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import ProfileUnavailable from "@/features/profile/components/ProfileUnavailable/ProfileUnavailable"
import { PublicProfileProvider } from "@/features/profile/context/PublicProfileContext"
import type { PublicPostsPage } from "@/features/profile/services/publicProfile.api"
import { profilePath, type ProfileUrlKind } from "@/shared/services/profileUrl"
import { useAuthStore } from "@/store/auth.store"

export default function PublicPostsView({
  username,
  kind,
  displayName,
  posts,
}: {
  username: string
  kind: ProfileUrlKind
  /** Name for the login wall's copy; falls back to the handle. */
  displayName: string
  /** Null when there is no public view — see the profile page's comment. */
  posts: PublicPostsPage | null
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
