"use client"

import { useCallback } from "react"
import ExploreRailShell from "../ExploreRailShell/ExploreRailShell"
import UserCard from "@/shared/components/entity/UserCard/UserCard"
import UserCardSkeleton from "@/shared/components/entity/UserCard/UserCardSkeleton"
import { useExplorePlayers } from "../../hooks/useExploreQueries"

const SKELETON_COUNT = 6

export default function PlayersRail() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useExplorePlayers()

  const players = data?.pages.flatMap((p) => p.results) ?? []
  // Mode is decided on the first page and locked for the rest of the scroll.
  const mode = data?.pages[0]?.mode
  const title = mode === "popular" ? "Popular players" : "Players near you"

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <ExploreRailShell
      title={title}
      seeAllHref="/explore/players"
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
        <UserCard key={player.id} user={player} />
      ))}
    </ExploreRailShell>
  )
}
