"use client"

import { Icon } from "@iconify/react"
import ExploreSearchBar from "../ExploreSearchBar/ExploreSearchBar"
import PlayersRail from "../PlayersRail/PlayersRail"
import TrendingPosts from "../TrendingPosts/TrendingPosts"
import { useExplorePlayers, useExplorePosts } from "../../hooks/useExploreQueries"
// Shares the ExplorePage shell styles (identical page / sections / empty-state layout).
import styles from "../ExplorePage/ExplorePage.module.css"

function resultCount(pages?: { results: unknown[] }[]): number {
  return pages?.reduce((n, p) => n + p.results.length, 0) ?? 0
}

/**
 * Organization Explore feed. Differs from the user ExplorePage in two ways:
 *   1. No Teams & Clubs / Academies org rails — players + posts only. (The org
 *      listing routes still exist; they're used by the search page's "see all".)
 *   2. Players are shown as TWO rails — "Players near you" and "Popular players"
 *      — instead of a single auto-picked rail. The nearby rail self-hides when
 *      the org has no location, so a location-less org just sees popular.
 *
 * The section hooks here share React Query keys with the rails (one request per
 * section) and exist only to drive the single "everything is empty" page state.
 */
export default function OrgExplorePage() {
  const nearbyPlayers = useExplorePlayers({ mode: "nearby" })
  const popularPlayers = useExplorePlayers({ mode: "popular" })
  const posts = useExplorePosts()

  const sections = [nearbyPlayers, popularPlayers, posts]

  // Only declare the page empty once every section has settled without error
  // and returned nothing — an errored section shows its own retry instead.
  const anyLoading = sections.some((s) => s.isLoading)
  const allEmpty =
    !anyLoading &&
    sections.every((s) => !s.isError && resultCount(s.data?.pages) === 0)

  return (
    <div className={styles.page}>
      <ExploreSearchBar />

      {allEmpty ? (
        <div className={styles.emptyState} role="status">
          <Icon
            icon="mdi:compass-outline"
            width={52}
            height={52}
            className={styles.emptyIcon}
            aria-hidden="true"
          />
          <p className={styles.emptyTitle}>Nothing to explore yet</p>
          <p className={styles.emptyBody}>
            Follow players and organizations, or check back soon as the community
            grows.
          </p>
        </div>
      ) : (
        <div className={styles.sections}>
          {/* Nearby first (more relevant); self-hides with no org location. */}
          <PlayersRail mode="nearby" />
          <PlayersRail mode="popular" />
          <TrendingPosts />
        </div>
      )}
    </div>
  )
}
