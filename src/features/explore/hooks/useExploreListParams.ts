import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ExploreListFilters } from "../api/explore.api"
import {
  DEFAULT_RADIUS,
  type ExploreFilterValues,
} from "../components/ExploreListFilters/ExploreListFilters"

/**
 * Entity-agnostic URL <-> filter state for the explore "view all" listings.
 * Owns: search debounce, applied filter values, the API filter object, and the
 * commit / clear helpers. Shared by the players and organizations pages so the
 * sync logic lives in exactly one place. Nothing here is player- or org-
 * specific (position is just another optional field the players page surfaces).
 */

type CommitPatch = Partial<ExploreFilterValues & { search: string }>

function readFilters(sp: URLSearchParams): ExploreFilterValues {
  return {
    sportId: sp.get("sport") ?? "",
    positionId: sp.get("position") ?? "",
    cityLabel: sp.get("city") ?? "",
    lat: sp.get("lat") ?? "",
    lng: sp.get("lng") ?? "",
    radius: sp.get("radius") ?? "",
  }
}

function applyToParams(params: URLSearchParams, patch: CommitPatch) {
  const set = (key: string, value: string | undefined) => {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  if ("search" in patch) set("q", patch.search)
  if ("sportId" in patch) set("sport", patch.sportId)
  if ("positionId" in patch) set("position", patch.positionId)
  if ("cityLabel" in patch) set("city", patch.cityLabel)
  if ("lat" in patch) set("lat", patch.lat)
  if ("lng" in patch) set("lng", patch.lng)
  if ("radius" in patch) set("radius", patch.radius)
}

function toApiFilters(search: string, f: ExploreFilterValues): ExploreListFilters {
  const out: ExploreListFilters = {}
  if (search) out.search = search
  if (f.sportId) out.sport_id = f.sportId
  if (f.positionId) out.position_id = f.positionId
  if (f.lat && f.lng) {
    out.lat = Number(f.lat)
    out.lng = Number(f.lng)
    out.radius_km = Number(f.radius || DEFAULT_RADIUS)
  }
  return out
}

export interface ExploreListParams {
  /** Controlled search box value (debounced before it reaches the query). */
  searchDraft: string
  setSearchDraft: (value: string) => void
  /** Applied filter values (URL-backed). */
  filters: ExploreFilterValues
  /** Commit a patch of search / filter fields to the URL. */
  commit: (patch: CommitPatch) => void
  /** Reset search + every filter. */
  clearAll: () => void
  /** The filters shaped for the API / query key. */
  apiFilters: ExploreListFilters
  /** Number of active chip-filters (sport / position / location). */
  activeCount: number
  /** Whether a search term or any filter is active. */
  hasQueryOrFilters: boolean
}

export function useExploreListParams(): ExploreListParams {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spString = searchParams.toString()

  // URL is the source of truth for applied state.
  const committedSearch = searchParams.get("q") ?? ""
  const filters = useMemo(
    () => readFilters(new URLSearchParams(spString)),
    [spString]
  )

  const commit = useCallback(
    (patch: CommitPatch) => {
      const params = new URLSearchParams(spString)
      applyToParams(params, patch)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, spString]
  )

  // ── Debounced search ────────────────────────────────────────
  const [searchDraft, setSearchDraft] = useState(committedSearch)

  // Re-seed the input when the URL search changes (external nav / clear-all).
  // Done during render — React's "adjust state on prop change" pattern — so we
  // avoid a setState-in-effect. During typing the debounce only commits after a
  // pause, so committed catches up to a value the input already holds (no-op).
  const [seenSearch, setSeenSearch] = useState(committedSearch)
  if (committedSearch !== seenSearch) {
    setSeenSearch(committedSearch)
    setSearchDraft(committedSearch)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== committedSearch) commit({ search: searchDraft })
    }, 350)
    return () => clearTimeout(t)
  }, [searchDraft, committedSearch, commit])

  const clearAll = useCallback(() => {
    setSearchDraft("")
    router.replace(pathname, { scroll: false })
  }, [router, pathname])

  const apiFilters = useMemo(
    () => toApiFilters(committedSearch, filters),
    [committedSearch, filters]
  )

  const activeCount = [
    filters.sportId,
    filters.positionId,
    filters.cityLabel,
  ].filter(Boolean).length
  const hasQueryOrFilters = committedSearch.length > 0 || activeCount > 0

  return {
    searchDraft,
    setSearchDraft,
    filters,
    commit,
    clearAll,
    apiFilters,
    activeCount,
    hasQueryOrFilters,
  }
}
