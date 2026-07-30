"use client"

import { useMemo, useState } from "react"
import { Icon } from "@iconify/react"
import UserCard from "@/shared/components/entity/UserCard/UserCard"
import UserCardSkeleton from "@/shared/components/entity/UserCard/UserCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import HighlightsChip from "@/features/highlights/components/HighlightsChip/HighlightsChip"
import HighlightPipelineViewer, {
  type PipelinePlayer,
} from "@/features/highlights/components/HighlightPipelineViewer/HighlightPipelineViewer"
import HighlightViewerActions from "@/features/highlights/components/HighlightViewerActions/HighlightViewerActions"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useExplorePlayers } from "../../hooks/useExploreQueries"
import { useExploreListParams } from "../../hooks/useExploreListParams"
import type { ExploreUser } from "../../api/explore.api"
import EntityListShell from "../EntityListShell/EntityListShell"
import ExploreListFilters from "../ExploreListFilters/ExploreListFilters"

// Card meta line: "city · 3.2 km" (distance only in nearby/location mode).
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

export default function PlayersListPage() {
  const { data: sports = [] } = useSportsList()
  const {
    searchDraft,
    setSearchDraft,
    filters,
    commit,
    clearAll,
    apiFilters,
    activeCount,
    hasQueryOrFilters,
  } = useExploreListParams()

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useExplorePlayers(apiFilters)

  const players = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data]
  )

  // Reel opened from a card. One player at a time here: cross-player swiping is
  // the recruitment pipeline's behaviour, where the list IS a review queue —
  // browsing explore shouldn't silently walk you into strangers' reels.
  const [reelPlayer, setReelPlayer] = useState<PipelinePlayer | null>(null)

  // NOTE: UserCard is intentionally NOT wrapped in React.memo — each row passes a
  // fresh `action` (<FollowButton/>) and `meta` element per render, so a memo
  // would always miss. Stabilizing those would mean restructuring the card,
  // which is out of scope for this perf pass.
  return (
    <EntityListShell
      title="Players"
      searchPlaceholder="Search players…"
      searchValue={searchDraft}
      onSearchChange={setSearchDraft}
      isFetching={isFetching}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={players.length === 0}
      hasQueryOrFilters={hasQueryOrFilters}
      onClearFilters={clearAll}
      hasNextPage={!!hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onEndReached={() => fetchNextPage()}
      renderSkeleton={() => <UserCardSkeleton />}
      filters={
        <ExploreListFilters
          showPosition
          sports={sports}
          values={filters}
          onChange={commit}
          onClearAll={clearAll}
          activeCount={activeCount}
        />
      }
    >
      {players.map((player) => (
        <UserCard
          key={player.id}
          user={player}
          meta={playerMeta(player)}
          chip={
            <HighlightsChip
              username={player.username}
              count={player.highlights_count}
              onOpen={() =>
                setReelPlayer({
                  username: player.username,
                  name: player.name,
                  headline: player.headline,
                  avatar: player.profile_photo,
                })
              }
            />
          }
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

      {reelPlayer && (
        <HighlightPipelineViewer
          players={[reelPlayer]}
          onClose={() => setReelPlayer(null)}
          renderActions={(p) => <HighlightViewerActions username={p.username} />}
        />
      )}
    </EntityListShell>
  )
}
