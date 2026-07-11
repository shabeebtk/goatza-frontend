"use client"

import { useMemo } from "react"
import { Icon } from "@iconify/react"
import OrgCard from "@/shared/components/entity/OrgCard/OrgCard"
import OrgCardSkeleton from "@/shared/components/entity/OrgCard/OrgCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useExploreOrgs } from "../../hooks/useExploreQueries"
import { useExploreListParams } from "../../hooks/useExploreListParams"
import type { ExploreOrg } from "../../api/explore.api"
import EntityListShell from "../EntityListShell/EntityListShell"
import ExploreListFilters from "../ExploreListFilters/ExploreListFilters"

interface OrgsListPageProps {
  /** Comma-separated Organization.Type values — same as the rails ("club,team" / "academy"). */
  types: string
  title: string
}

// Card meta line: "city · 3.2 km". Level is intentionally left off — city +
// distance is the priority and keeps the compact card uncluttered.
function orgMeta(o: ExploreOrg): React.ReactNode {
  const parts: string[] = []
  if (o.city) parts.push(o.city)
  if (o.distance_km != null) parts.push(`${o.distance_km} km`)
  if (!parts.length) return undefined
  return (
    <>
      <Icon icon="mdi:map-marker-outline" width={12} height={12} aria-hidden="true" />
      <span>{parts.join(" · ")}</span>
    </>
  )
}

export default function OrgsListPage({ types, title }: OrgsListPageProps) {
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
  } = useExploreOrgs(types, apiFilters)

  const orgs = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data]
  )

  // NOTE: OrgCard is intentionally NOT wrapped in React.memo — each row passes a
  // fresh `action`/`meta` element per render, so a memo would always miss.
  return (
    <EntityListShell
      title={title}
      searchPlaceholder={`Search ${title.toLowerCase()}…`}
      searchValue={searchDraft}
      onSearchChange={setSearchDraft}
      isFetching={isFetching}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={orgs.length === 0}
      hasQueryOrFilters={hasQueryOrFilters}
      onClearFilters={clearAll}
      hasNextPage={!!hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onEndReached={() => fetchNextPage()}
      renderSkeleton={() => <OrgCardSkeleton />}
      filters={
        // Organizations get search + sport + location only — no position control.
        <ExploreListFilters
          showPosition={false}
          sports={sports}
          values={filters}
          onChange={commit}
          onClearAll={clearAll}
          activeCount={activeCount}
        />
      }
    >
      {orgs.map((org) => (
        <OrgCard
          key={org.id}
          org={org}
          meta={orgMeta(org)}
          action={
            <FollowButton
              targetId={org.id}
              targetType="organization"
              name={org.name}
              initialFollowing={org.is_following}
              fullWidth
            />
          }
        />
      ))}
    </EntityListShell>
  )
}
