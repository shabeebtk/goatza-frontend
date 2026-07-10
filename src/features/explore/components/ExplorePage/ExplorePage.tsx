"use client"

import { Icon } from "@iconify/react"
import ExploreSearchBar from "../ExploreSearchBar/ExploreSearchBar"
import PlayersRail from "../PlayersRail/PlayersRail"
import OrgsRail from "../OrgsRail/OrgsRail"
import TrendingPosts from "../TrendingPosts/TrendingPosts"
import {
  useExplorePlayers,
  useExploreOrgs,
  useExplorePosts,
} from "../../hooks/useExploreQueries"
import styles from "./ExplorePage.module.css"

const TEAMS_TYPES = "club,team"
const ACADEMY_TYPES = "academy"

function resultCount(pages?: { results: unknown[] }[]): number {
  return pages?.reduce((n, p) => n + p.results.length, 0) ?? 0
}

/**
 * Explore feed. A sticky search bar over three horizontal discovery rails and a
 * vertical trending-posts feed. Every section owns its own data + loading /
 * empty / error state, so one failing or empty section never affects the rest.
 *
 * The section hooks are also read here (React Query dedupes them with the
 * children — same keys, one request each) purely to detect the "everything is
 * empty" case and show a single friendly page-level empty state.
 */
export default function ExplorePage() {
  const players = useExplorePlayers()
  const teams = useExploreOrgs(TEAMS_TYPES)
  const academies = useExploreOrgs(ACADEMY_TYPES)
  const posts = useExplorePosts()

  const sections = [players, teams, academies, posts]

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
          <PlayersRail />

          <OrgsRail
            types={TEAMS_TYPES}
            nearbyTitle="Teams & Clubs"
            popularTitle="Popular teams & clubs"
            seeAllHref="/explore/organizations"
          />

          <OrgsRail
            types={ACADEMY_TYPES}
            nearbyTitle="Academies"
            popularTitle="Popular academies"
            seeAllHref="/explore/academies"
          />

          <TrendingPosts />
        </div>
      )}
    </div>
  )
}
