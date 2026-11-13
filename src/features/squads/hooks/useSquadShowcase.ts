"use client"

import { useQuery } from "@tanstack/react-query"

import {
  fetchPublicSquadPage,
  fetchPublicSquadShowcase,
  getSquadShowcaseApi,
  getSquadShowcasePageApi,
} from "../services/squadsShowcase.api"
import type { ShowcaseList, ShowcaseSquadPage } from "../types"
import { squadKeys } from "./useSquads"

export const showcaseKeys = {
  all: () => [...squadKeys.all(), "showcase"] as const,
  list: (username: string, viewer: "signed-in" | "anonymous") =>
    [...squadKeys.all(), "showcase", username, viewer] as const,
  page: (username: string, squadId: string, viewer: "signed-in" | "anonymous") =>
    [...squadKeys.all(), "showcase", username, squadId, viewer] as const,
}

/** A 404 is an answer — hidden, empty, private or blocked, the server won't say — not an error. */
function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 404
}

/** A club's squads, for a signed-in viewer (any actor). Null for the server's one 404. */
export const useSquadShowcase = (username: string, enabled = true) =>
  useQuery<ShowcaseList | null>({
    queryKey: showcaseKeys.list(username, "signed-in"),
    queryFn: async () => {
      try {
        return await getSquadShowcaseApi(username)
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },
    enabled: enabled && !!username,
    staleTime: 1000 * 60,
  })

/** One squad's page, for a signed-in viewer. Null for the 404. */
export const useSquadShowcasePage = (username: string, squadId: string, enabled = true) =>
  useQuery<ShowcaseSquadPage | null>({
    queryKey: showcaseKeys.page(username, squadId, "signed-in"),
    queryFn: async () => {
      try {
        return await getSquadShowcasePageApi(username, squadId)
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },
    enabled: enabled && !!username && !!squadId,
    staleTime: 1000 * 60,
  })

/**
 * The anonymous list, fetched in the browser: the club profile's section, which
 * the server does not seed. Null when the API says no.
 */
export const usePublicSquadShowcase = (username: string, enabled = true) =>
  useQuery<ShowcaseList | null>({
    queryKey: showcaseKeys.list(username, "anonymous"),
    queryFn: async () => {
      const result = await fetchPublicSquadShowcase(username)
      if (result.status === "ok") return result.data
      if (result.status === "not_found") return null
      throw new Error(result.reason)
    },
    enabled: enabled && !!username,
    staleTime: 1000 * 60,
  })

/** The anonymous squad page in the browser: only when the server's own read failed. */
export const usePublicSquadPage = (username: string, squadId: string, enabled = true) =>
  useQuery<ShowcaseSquadPage | null>({
    queryKey: showcaseKeys.page(username, squadId, "anonymous"),
    queryFn: async () => {
      const result = await fetchPublicSquadPage(username, squadId)
      if (result.status === "ok") return result.data
      if (result.status === "not_found") return null
      throw new Error(result.reason)
    },
    enabled: enabled && !!username && !!squadId,
    staleTime: 1000 * 60,
  })
