/**
 * The page as everyone else sees it. Two transports for the same shape:
 *   - signed in (any actor): the axios api, as whoever is acting, so a block or
 *     the org's own admin profile is answered for that actor;
 *   - anonymous: `fetchPublic`, which works on the server (ISR, 60 s) and in the
 *     browser, and turns the one 404 into `{status: "not_found"}`.
 */

import api from "@/core/api/axios"
import { fetchPublic, type PublicFetchResult } from "@/features/profile/services/publicProfile.api"

import type { PageShowcase } from "../types"

const enc = encodeURIComponent

export const getPageShowcaseApi = async (username: string): Promise<PageShowcase> => {
  const res = await api.get(`/page/showcase/${enc(username)}`)
  return res.data.data
}

export function fetchPublicPageShowcase(username: string): Promise<PublicFetchResult<PageShowcase>> {
  return fetchPublic<PageShowcase>(`/public/organization/${enc(username)}/page`)
}
