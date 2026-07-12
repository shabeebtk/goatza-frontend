"use client"

import { useCallback } from "react"
import ExploreRailShell from "../ExploreRailShell/ExploreRailShell"
import UserCard from "@/shared/components/entity/UserCard/UserCard"
import UserCardSkeleton from "@/shared/components/entity/UserCard/UserCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import { useNavigation } from "@/shared/services/navigation.service"
import type { ExploreMode } from "../../api/explore.api"
import { useExplorePlayers } from "../../hooks/useExploreQueries"

const SKELETON_COUNT = 6

interface PlayersRailProps {
  /**
   * Force a discovery mode. Set by the org explore page to render popular and
   * nearby players as two rails. Omit for the user rail, which auto-picks the
   * mode from the backend response. A forced "nearby" rail self-hides when the
   * actor has no location (its query comes back empty).
   */
  mode?: ExploreMode
}

export default function PlayersRail({ mode }: PlayersRailProps = {}) {
  const { toExploreList } = useNavigation()
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useExplorePlayers(mode ? { mode } : undefined)

  const players = data?.pages.flatMap((p) => p.results) ?? []
  // Forced mode wins; otherwise read the mode the backend decided (locked on
  // the first page for the rest of the scroll).
  const resolvedMode = mode ?? data?.pages[0]?.mode
  const title = resolvedMode === "popular" ? "Popular players" : "Players near you"

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <ExploreRailShell
      title={title}
      seeAllHref={toExploreList("players")}
      isLoading={isLoading}
      isError={isError}
      isEmpty={players.length === 0}
      onRetry={() => refetch()}
      onEndReached={hasNextPage ? onEndReached : undefined}
      isFetchingNextPage={isFetchingNextPage}
      skeletons={Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    >
      {players.map((player) => (
        <UserCard
          key={player.id}
          user={player}
          action={
            <FollowButton
              targetId={player.id}
              targetType="user"
              name={player.name}
              fullWidth
            />
          }
        />
      ))}
    </ExploreRailShell>
  )
}
