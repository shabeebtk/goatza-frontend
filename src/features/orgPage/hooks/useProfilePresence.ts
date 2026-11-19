"use client"

import { usePublicSection } from "@/features/profile/context/PublicProfileContext"
import { useRecruitmentsList } from "@/features/recruitments/hooks/useRecruitments"
import type { Recruitment } from "@/features/recruitments/services/recruitments.api"
import { usePublicSquadShowcase, useSquadShowcase } from "@/features/squads/hooks/useSquadShowcase"

/**
 * Whether the sections other features draw have anything in them, so the page
 * body can leave them (and their chip) out. Each asks exactly what the section
 * itself asks, with the same keys, so React Query answers both with one request.
 */

/** The squads OrgSquadsSection would show: 0 while unknown or on the 404. */
export function useShowcaseSquadCount(username: string, anonymous: boolean): number {
  const signedIn = useSquadShowcase(username, !anonymous)
  const loggedOut = usePublicSquadShowcase(username, anonymous)
  const data = anonymous ? loggedOut.data : signedIn.data
  return data?.squads?.length ?? 0
}

/**
 * The trials RecruitmentsList's preview would show: the server-rendered rows on
 * the public view, else the same one-item page it reads. 0 while unknown.
 */
export function useTrialCount(username: string): number {
  const publicRecruitments = usePublicSection<Recruitment>("recruitments")
  const { data } = useRecruitmentsList({ username }, 1, !publicRecruitments)
  if (publicRecruitments) return publicRecruitments.length
  return data?.pages[0]?.count ?? data?.pages[0]?.results.length ?? 0
}
