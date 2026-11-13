"use client"

import { BackHeader } from "@/shared/components/ui"
import UnavailableState from "@/shared/components/UnavailableState/UnavailableState"
import PublicCtaBar from "@/features/profile/components/PublicCtaBar/PublicCtaBar"
import { profilePath } from "@/shared/services/profileUrl"
import { useAuthStore } from "@/store/auth.store"
import { usePublicSquadShowcase, useSquadShowcase } from "../../hooks/useSquadShowcase"
import { countLabel, publicSquadsPath } from "../../squadUtils"
import type { ShowcaseList } from "../../types"
import ShowcaseSquadCard from "../ShowcaseSquadCard/ShowcaseSquadCard"
import styles from "./PublicSquadsList.module.css"

export type SeedStatus = "ok" | "not_found" | "unavailable"

function Skeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className={styles.skeletonCard} />
      ))}
    </div>
  )
}

/**
 * Every squad a club shows, at /organization/profile/<username>/squads. Signed
 * in, the showcase is read in the browser as the viewer (blocks apply);
 * anonymous, the server's read seeds it, with a browser read only when the
 * server could not reach the API.
 */
/** The list's loading shape, for its loading.tsx. */
export function SquadsListSkeleton() {
  return (
    <div className={styles.page}>
      <Skeleton />
    </div>
  )
}

export default function PublicSquadsList({
  username,
  initial,
  initialStatus,
}: {
  username: string
  initial: ShowcaseList | null
  initialStatus: SeedStatus
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isAuthLoading = useAuthStore((state) => state.isLoading)

  const signedIn = useSquadShowcase(username, !isAuthLoading && isAuthenticated)
  const fallback = usePublicSquadShowcase(
    username,
    !isAuthLoading && !isAuthenticated && initialStatus === "unavailable"
  )

  const clubPath = profilePath(username, "organization")

  if (isAuthLoading || (isAuthenticated && signedIn.isLoading) || fallback.isLoading) {
    return (
      <div className={styles.page}>
        <BackHeader title="Squads" fallback={clubPath} />
        <Skeleton />
      </div>
    )
  }

  const data = isAuthenticated ? signedIn.data : (initial ?? fallback.data)
  if (!data || data.squads.length === 0) {
    return <UnavailableState icon="mdi:shield-off-outline" title="These squads aren't available." />
  }

  const orgName = data.organization.name || data.organization.username

  return (
    <div className={styles.page}>
      <BackHeader
        title="Squads"
        subtitle={`${orgName} · ${countLabel(data.squads.length, "squad", "squads")}`}
        fallback={clubPath}
      />
      <div className={styles.grid}>
        {data.squads.map((squad) => (
          <ShowcaseSquadCard key={squad.id} orgUsername={data.organization.username} squad={squad} />
        ))}
      </div>

      {!isAuthenticated && (
        <PublicCtaBar displayName={orgName} nextPath={publicSquadsPath(username)} />
      )}
    </div>
  )
}
