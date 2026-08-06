"use client"

/**
 * Bridge between the server-rendered public org page and <OrgProfile>.
 * Same branch, same reasoning, as PublicProfileView — see its docstring.
 */

import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"
import PublicCtaBar from "@/features/profile/components/PublicCtaBar/PublicCtaBar"
import {
  PublicProfileProvider,
  sectionsFromOrgBundle,
} from "@/features/profile/context/PublicProfileContext"
import type { PublicOrgBundle } from "@/features/profile/services/publicProfile.api"
import { useAuthStore } from "@/store/auth.store"

export default function PublicOrgProfileView({
  username,
  bundle,
}: {
  username: string
  bundle: PublicOrgBundle
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) return null

  if (isAuthenticated) {
    // isOwn stays false here exactly as it did before the route move — an
    // org's own admins reach their profile through /organization/admin/<id>.
    return <OrgProfile username={username} isOwn={false} />
  }

  const profilePath = `/organization/profile/${bundle.profile.username}`

  return (
    <PublicProfileProvider
      displayName={bundle.profile.name || bundle.profile.username}
      profilePath={profilePath}
      sections={sectionsFromOrgBundle(bundle)}
    >
      <OrgProfile username={username} publicOrg={bundle.profile} />
      <PublicCtaBar
        displayName={bundle.profile.name || bundle.profile.username}
        nextPath={profilePath}
      />
    </PublicProfileProvider>
  )
}
