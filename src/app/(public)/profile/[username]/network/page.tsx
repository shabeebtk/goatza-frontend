"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"

/**
 * This route moved into the public group with the rest of the profile subtree —
 * splitting one feature across two route groups would mean two layouts for the
 * same page. The gate lives in the component instead: follower COUNTS are
 * public (they're on every card already), the follower GRAPH is not.
 */
export default function UserNetworkPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  return (
    <PublicRouteWall
      title="Sign in to see this"
      message={`Follower and connection lists are only visible to people on Goatza. Join to see who @${username} is connected with.`}
      nextPath={`/profile/${username}/network`}
    >
      <NetworkPage username={username} profileType="user" />
    </PublicRouteWall>
  )
}
