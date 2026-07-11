"use client"

import { useCallback } from "react"
import ExploreRailShell from "../ExploreRailShell/ExploreRailShell"
import OrgCard from "@/shared/components/entity/OrgCard/OrgCard"
import OrgCardSkeleton from "@/shared/components/entity/OrgCard/OrgCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import { useExploreOrgs } from "../../hooks/useExploreQueries"

const SKELETON_COUNT = 6

interface OrgsRailProps {
  /** Comma-separated Organization.Type values, e.g. "club,team". */
  types: string
  nearbyTitle: string
  popularTitle: string
  seeAllHref?: string
}

export default function OrgsRail({
  types,
  nearbyTitle,
  popularTitle,
  seeAllHref,
}: OrgsRailProps) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useExploreOrgs(types)

  const orgs = data?.pages.flatMap((p) => p.results) ?? []
  const mode = data?.pages[0]?.mode
  const title = mode === "popular" ? popularTitle : nearbyTitle

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <ExploreRailShell
      title={title}
      seeAllHref={seeAllHref}
      isLoading={isLoading}
      isError={isError}
      isEmpty={orgs.length === 0}
      onRetry={() => refetch()}
      onEndReached={hasNextPage ? onEndReached : undefined}
      isFetchingNextPage={isFetchingNextPage}
      skeletons={Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <OrgCardSkeleton key={i} />
      ))}
    >
      {orgs.map((org) => (
        <OrgCard
          key={org.id}
          org={org}
          action={
            <FollowButton
              targetId={org.id}
              targetType="organization"
              name={org.name}
              fullWidth
            />
          }
        />
      ))}
    </ExploreRailShell>
  )
}
