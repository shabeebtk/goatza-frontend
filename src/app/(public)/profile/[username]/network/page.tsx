"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"

/**
 * This route moved into the public group with the rest of the profile subtree —
 * splitting one feature across two route groups would mean two layouts for the
 * same page. The gate lives in the component instead: follower COUNTS are
 * public (they're on every card already), the follower GRAPH is not.
 *
 * NOTHING TO ADD FOR MINORS, and that is worth stating rather than leaving a
 * reader to check. The network lists appear on the "hidden for a minor" list,
 * but the wall below already withholds them from every anonymous visitor
 * regardless of whose profile it is — a stricter rule than the minor tier
 * needs. Nothing is fetched for a signed-out visitor either, so there is no
 * empty or 404 response reaching this page to handle. If this wall is ever
 * relaxed, the minor case has to be reinstated here explicitly.
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
