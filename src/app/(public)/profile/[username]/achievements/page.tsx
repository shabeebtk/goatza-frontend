"use client"

/**
 * /profile/[username]/achievements — the whole award shelf, behind "See all".
 *
 * In the public group with the rest of the profile subtree, for the reason
 * the network route gives: splitting one feature across two route groups
 * would mean two layouts for the same page. The gate is in here instead.
 *
 * WHY A WALL. The profile page itself serves a logged-out visitor from the
 * server-rendered public bundle, but the achievements endpoint behind this
 * page is IsAuthenticated — so an anonymous reader would get an error state rather
 * than a list. The section on the profile only offers its "See all" to a
 * signed-in reader for the same reason; this covers the URL being opened
 * directly.
 */

import { use } from "react"

import AchievementsListPage from "@/features/achievements/components/AchievementsListPage/AchievementsListPage"
import PublicRouteWall from "@/features/profile/components/PublicRouteWall/PublicRouteWall"
import { useAuthStore } from "@/store/auth.store"

export default function UserAchievementsPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const me = useAuthStore((s) => s.user)

  return (
    <PublicRouteWall
      title="Sign in to see this"
      message={`Full achievement lists are only visible to people on Goatza. Join to see everything @${username} has won.`}
      nextPath={`/profile/${username}/achievements`}
    >
      <AchievementsListPage
        username={username}
        isOwn={me?.username === username}
      />
    </PublicRouteWall>
  )
}
