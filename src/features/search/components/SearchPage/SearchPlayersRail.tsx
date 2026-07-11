"use client"

import { Icon } from "@iconify/react"
import ExploreRailShell from "@/features/explore/components/ExploreRailShell/ExploreRailShell"
import UserCard from "@/shared/components/entity/UserCard/UserCard"
import UserCardSkeleton from "@/shared/components/entity/UserCard/UserCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import type { ExploreUser } from "@/features/explore/api/explore.api"
import { useSearchPlayers } from "../../hooks/useSearchQueries"

const SKELETON_COUNT = 6

// City meta line. Searching runs in "popular" mode so distance_km is null;
// guard it anyway so the card stays correct if that ever changes.
function playerMeta(p: ExploreUser): React.ReactNode {
  const parts: string[] = []
  if (p.city) parts.push(p.city)
  if (p.distance_km != null) parts.push(`${p.distance_km} km`)
  if (!parts.length) return undefined
  return (
    <>
      <Icon icon="mdi:map-marker-outline" width={12} height={12} aria-hidden="true" />
      <span>{parts.join(" · ")}</span>
    </>
  )
}

interface SearchPlayersRailProps {
  q: string
  seeAllHref: string
}

/**
 * Players search rail — one page of results as a horizontal rail (no rail
 * infinite-scroll). Reuses ExploreRailShell, so it self-hides when empty and
 * shows its own loading / error state.
 */
export default function SearchPlayersRail({ q, seeAllHref }: SearchPlayersRailProps) {
  const { data, isLoading, isError, refetch } = useSearchPlayers(q)
  const players = data?.results ?? []

  return (
    <ExploreRailShell
      title="Players"
      seeAllHref={seeAllHref}
      isLoading={isLoading}
      isError={isError}
      isEmpty={players.length === 0}
      onRetry={() => refetch()}
      skeletons={Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    >
      {players.map((player) => (
        <UserCard
          key={player.id}
          user={player}
          meta={playerMeta(player)}
          action={
            <FollowButton
              targetId={player.id}
              targetType="user"
              name={player.name}
              initialFollowing={player.is_following}
              fullWidth
            />
          }
        />
      ))}
    </ExploreRailShell>
  )
}
