"use client"

/**
 * Bridge between the server-rendered public profile page and <UserProfile>.
 *
 * Both viewers land here, and the branch is the whole job:
 *
 *   signed in  → render <UserProfile> untouched. It fetches
 *                /user/<username>/details as it always has, so a logged-in
 *                person opening a shared link gets the full authenticated
 *                profile (their own follow state, their own followers-only
 *                posts, edit controls if it's theirs). The server bundle is
 *                discarded — it is the anonymous view, and showing it to them
 *                would be a downgrade.
 *
 *   anonymous  → seed the public context with the bundle and render the same
 *                component in public mode. Nothing re-fetches.
 *
 * `bundle` may be NULL, and this is the important case. The page used to call
 * notFound() when the public bundle was missing, which meant the ANONYMOUS
 * payload decided whether anyone could see the route at all — so a profile with
 * "Public profile" turned off 404'd for signed-in Goatza users too, and any
 * transient API failure 404'd every profile on the site. The server cannot tell
 * the two visitors apart without reading cookies, which would opt the route out
 * of ISR; the client can, so the decision moved here.
 *
 * `isLoading` renders nothing rather than a skeleton: PublicShell above is
 * already showing one, and two stacked skeletons read as a broken page.
 */

import UserProfile from "@/features/profile/components/UserProfile/UserProfile"
import ProfileUnavailable from "@/features/profile/components/ProfileUnavailable/ProfileUnavailable"
import PublicCtaBar from "@/features/profile/components/PublicCtaBar/PublicCtaBar"
import {
  PublicProfileProvider,
  sectionsFromUserBundle,
} from "@/features/profile/context/PublicProfileContext"
import type { PublicUserBundle } from "@/features/profile/services/publicProfile.api"
import { useAuthStore } from "@/store/auth.store"

export default function PublicProfileView({
  username,
  bundle,
}: {
  username: string
  bundle: PublicUserBundle | null
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const me = useAuthStore((s) => s.user)

  if (isLoading) return null

  // Signed in — the authenticated endpoint is the source of truth, whatever the
  // public one said. It renders its own "Profile not found" for a username that
  // genuinely doesn't exist, and the full profile for one that is merely hidden
  // from the logged-out web.
  if (isAuthenticated) {
    return (
      <UserProfile username={username} isOwn={me?.username === username} />
    )
  }

  // Anonymous, and there is no public view. Says nothing about why.
  if (!bundle) {
    return <ProfileUnavailable nextPath={`/profile/${username}`} />
  }

  const profilePath = `/profile/${bundle.profile.username}`

  return (
    <PublicProfileProvider
      displayName={bundle.profile.name || bundle.profile.username}
      profilePath={profilePath}
      sections={sectionsFromUserBundle(bundle)}
    >
      <UserProfile username={username} publicProfile={bundle.profile} />
      <PublicCtaBar
        displayName={bundle.profile.name || bundle.profile.username}
        nextPath={profilePath}
      />
    </PublicProfileProvider>
  )
}
