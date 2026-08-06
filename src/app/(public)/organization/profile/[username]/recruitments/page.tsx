"use client"

import { use } from "react"
import RecruitmentsList from "@/features/recruitments/components/RecruitmentsList/RecruitmentsList"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"

/**
 * The org's full recruitment list.
 *
 * Walled for anonymous visitors rather than made public: the org's public
 * profile already shows its live listings, and applying — the only reason to
 * open the full list — needs an account anyway. Making this page public would
 * mean a second, differently-filtered recruitment surface to keep in step with
 * the visibility rules for no gain.
 */
export default function OrgRecruitmentsPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  return (
    <PublicRouteWall
      title="Sign in to see all opportunities"
      message={`Join Goatza to browse every opening at @${username} and apply.`}
      nextPath={`/organization/profile/${username}/recruitments`}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
        <RecruitmentsList username={username} showOrg={true} />
      </div>
    </PublicRouteWall>
  )
}
