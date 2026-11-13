/**
 * The showcase: a club's squads as everyone else sees them. The club's own
 * members get no exception — hidden squads never appear here. Every miss (a
 * hidden or empty squad, a private club for an anonymous viewer, a block) is
 * one 404.
 *
 * Two transports for the same shapes:
 *   - signed in: the axios api, as whoever is acting (a block is per actor);
 *   - anonymous: `fetchPublic`, which works on the server (an absolute origin,
 *     ISR) and in the browser, and turns a 404 into `{status: "not_found"}`.
 */

import api from "@/core/api/axios"
import { fetchPublic, type PublicFetchResult } from "@/features/profile/services/publicProfile.api"

import type { ShowcaseList, ShowcaseSquadPage } from "../types"

const enc = encodeURIComponent

// ── Signed in ─────────────────────────────────────────────────

export const getSquadShowcaseApi = async (username: string): Promise<ShowcaseList> => {
  const res = await api.get(`/squads/showcase/${enc(username)}`)
  return res.data.data
}

export const getSquadShowcasePageApi = async (
  username: string,
  squadId: string
): Promise<ShowcaseSquadPage> => {
  const res = await api.get(`/squads/showcase/${enc(username)}/${enc(squadId)}`)
  return res.data.data
}

// ── Anonymous (server-renderable) ─────────────────────────────

export function fetchPublicSquadShowcase(username: string): Promise<PublicFetchResult<ShowcaseList>> {
  return fetchPublic<ShowcaseList>(`/public/organization/${enc(username)}/squads`)
}

export function fetchPublicSquadPage(
  username: string,
  squadId: string
): Promise<PublicFetchResult<ShowcaseSquadPage>> {
  return fetchPublic<ShowcaseSquadPage>(
    `/public/organization/${enc(username)}/squads/${enc(squadId)}`
  )
}
