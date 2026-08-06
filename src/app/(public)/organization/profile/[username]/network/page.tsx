"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"

/** Same gate as the user network page — see its docstring. */
export default function OrgNetworkPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  return (
    <PublicRouteWall
      title="Sign in to see this"
      message={`Follower lists are only visible to people on Goatza. Join to see who follows @${username}.`}
      nextPath={`/organization/profile/${username}/network`}
    >
      {/* Organizations have no Connections tab (backend rejects it for orgs). */}
      <NetworkPage username={username} profileType="organization" />
    </PublicRouteWall>
  )
}
