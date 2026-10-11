"use client"

/**
 * /profile/[username]/career — the whole career history, behind "See all".
 *
 * In the public group with the rest of the profile subtree, for the reason
 * the network route gives: splitting one feature across two route groups
 * would mean two layouts for the same page. The gate is in here instead.
 *
 * WHY A WALL. The profile page itself serves a logged-out visitor from the
 * server-rendered public bundle, but the careers endpoint behind this page is
 * IsAuthenticated — so an anonymous reader would get an error state rather
 * than a list. The section on the profile only offers its "See all" to a
 * signed-in reader for the same reason; this covers the URL being opened
 * directly.
 */

import { use } from "react"

import CareerListPage from "@/features/career/components/CareerListPage/CareerListPage"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"
import { useAuthStore } from "@/store/auth.store"

export default function UserCareerPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const me = useAuthStore((s) => s.user)

  return (
    <PublicRouteWall
      title="Sign in to see this"
      message={`Full career histories are only visible to people on Goatza. Join to see everything @${username} has played.`}
      nextPath={`/profile/${username}/career`}
    >
      <CareerListPage username={username} isOwn={me?.username === username} />
    </PublicRouteWall>
  )
}
