"use client"

import { useQuery, type QueryClient } from "@tanstack/react-query"

import { fetchPublicPageShowcase, getPageShowcaseApi } from "../services/pageShowcase.api"
import type { PageShowcase } from "../types"

/** Beside pageKeys' per-org trees, under the same root, keyed by username. */
export const showcaseKeys = {
  all: () => ["orgPage", "showcase"] as const,
  page: (username: string, viewer: "signed" | "anonymous") =>
    ["orgPage", "showcase", username, viewer] as const,
}

/**
 * After the club edits its page: every showcase read goes stale, so the org's own
 * profile shows the change the next time it is opened rather than a minute later.
 */
export function invalidateShowcases(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: showcaseKeys.all() })
}

/** The one 404 is an answer (inactive, suspended, private, a block), not an error. */
function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404
}

/** For a signed-in viewer, as whoever is acting. Null for the 404. */
export const usePageShowcase = (username: string, enabled = true) =>
  useQuery<PageShowcase | null>({
    queryKey: showcaseKeys.page(username, "signed"),
    queryFn: async () => {
      try {
        return await getPageShowcaseApi(username)
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },
    enabled: enabled && !!username,
    staleTime: 1000 * 60,
  })

/**
 * For an anonymous viewer. The public route's server component seeds it
 * (`initialData`, null on any miss), so the page arrives with the profile.
 */
export const usePublicPageShowcase = (
  username: string,
  enabled = true,
  initialData?: PageShowcase | null
) =>
  useQuery<PageShowcase | null>({
    queryKey: showcaseKeys.page(username, "anonymous"),
    queryFn: async () => {
      const result = await fetchPublicPageShowcase(username)
      if (result.status === "ok") return result.data
      if (result.status === "not_found") return null
      throw new Error(result.reason)
    },
    enabled: enabled && !!username,
    initialData,
    staleTime: 1000 * 60,
  })
