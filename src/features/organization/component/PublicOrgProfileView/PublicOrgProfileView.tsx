"use client"

/**
 * Bridge between the server-rendered public org page and <OrgProfile>.
 * Same branch, same reasoning, as PublicProfileView — see its docstring.
 */

import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"
import ProfileUnavailable from "@/features/profile/components/ProfileUnavailable/ProfileUnavailable"
import PublicCtaBar from "@/features/profile/components/PublicCtaBar/PublicCtaBar"
import {
  PublicProfileProvider,
  sectionsFromOrgBundle,
} from "@/features/profile/context/PublicProfileContext"
import type { PublicOrgBundle } from "@/features/profile/services/publicProfile.api"
import { hasContactAction } from "@/features/enquiries/pageContact"
import { usePublicPageShowcase } from "@/features/orgPage/hooks/usePageShowcase"
import type { PageShowcase } from "@/features/orgPage/types"
import { useAuthStore } from "@/store/auth.store"

export default function PublicOrgProfileView({
  username,
  bundle,
  pageSeed = null,
}: {
  username: string
  bundle: PublicOrgBundle | null
  /** The anonymous page, read with the bundle: null on any miss. */
  pageSeed?: PageShowcase | null
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  // The same read (and key) the profile makes from the seed, so this costs
  // nothing: a page with any contact action has the Enquire bar instead of the
  // sign-up bar. Follow still walls to sign-up.
  const anonymousPage = usePublicPageShowcase(
    username,
    !isLoading && !isAuthenticated && Boolean(bundle),
    pageSeed
  ).data
  const pageHasContact = hasContactAction(anonymousPage?.contact)

  if (isLoading) return null

  if (isAuthenticated) {
    // isOwn stays false here exactly as it did before the route move — an
    // org's own admins reach their profile through /organization/admin/<id>.
    return <OrgProfile username={username} isOwn={false} />
  }

  // Anonymous with no public view — see the user twin for why this is not a
  // server-side notFound().
  if (!bundle) {
    return (
      <ProfileUnavailable nextPath={`/organization/profile/${username}`} />
    )
  }

  const profilePath = `/organization/profile/${bundle.profile.username}`

  return (
    <PublicProfileProvider
      displayName={bundle.profile.name || bundle.profile.username}
      profilePath={profilePath}
      sections={sectionsFromOrgBundle(bundle)}
    >
      <OrgProfile username={username} publicOrg={bundle.profile} publicPage={pageSeed} />
      {!pageHasContact && (
        <PublicCtaBar
          displayName={bundle.profile.name || bundle.profile.username}
          nextPath={profilePath}
        />
      )}
    </PublicProfileProvider>
  )
}
