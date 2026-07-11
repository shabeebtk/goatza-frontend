"use client"

import { Icon } from "@iconify/react"
import ExploreRailShell from "@/features/explore/components/ExploreRailShell/ExploreRailShell"
import OrgCard from "@/shared/components/entity/OrgCard/OrgCard"
import OrgCardSkeleton from "@/shared/components/entity/OrgCard/OrgCardSkeleton"
import FollowButton from "@/features/connections/components/FollowButton/FollowButton"
import type { ExploreOrg } from "@/features/explore/api/explore.api"
import { useSearchOrgs } from "../../hooks/useSearchQueries"

const SKELETON_COUNT = 6

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

interface SearchOrgsRailProps {
  q: string
  /** Comma-separated Organization.Type values ("club,team" or "academy"). */
  types: string
  title: string
  seeAllHref: string
}

/**
 * Organizations search rail — used twice: Teams & Clubs ("club,team") and
 * Academies ("academy"). Reuses ExploreRailShell for its state machine.
 */
export default function SearchOrgsRail({
  q,
  types,
  title,
  seeAllHref,
}: SearchOrgsRailProps) {
  const { data, isLoading, isError, refetch } = useSearchOrgs(q, types)
  const orgs = data?.results ?? []

  return (
    <ExploreRailShell
      title={title}
      seeAllHref={seeAllHref}
      isLoading={isLoading}
      isError={isError}
      isEmpty={orgs.length === 0}
      onRetry={() => refetch()}
      skeletons={Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <OrgCardSkeleton key={i} />
      ))}
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
    </ExploreRailShell>
  )
}
