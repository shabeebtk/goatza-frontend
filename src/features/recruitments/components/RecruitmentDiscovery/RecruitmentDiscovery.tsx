"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import { useRecruitmentsList } from "../../hooks/useRecruitments"
import type { FetchRecruitmentsParams } from "../../services/recruitments.api"
import {
  EMPTY_DISCOVERY_FILTERS,
  type DiscoveryFilters,
} from "../../filterOptions"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import RecruitmentFilters from "./RecruitmentFilters"
import styles from "./RecruitmentDiscovery.module.css"

// ── URL <-> filters ───────────────────────────────────────────

function readFilters(sp: URLSearchParams): DiscoveryFilters {
  return {
    search: sp.get("search") ?? "",
    sport_id: sp.get("sport") ?? "",
    recruitment_type: (sp.get("type") ??
      "") as DiscoveryFilters["recruitment_type"],
    city: sp.get("city") ?? "",
    experience_level: sp.get("experience") ?? "",
    birthYear: sp.get("birth_year") ?? "",
    goatza: sp.get("goatza") === "1",
  }
}

function applyToParams(
  params: URLSearchParams,
  patch: Partial<DiscoveryFilters>
) {
  const set = (key: string, value: string) => {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  if ("search" in patch) set("search", patch.search ?? "")
  if ("sport_id" in patch) set("sport", patch.sport_id ?? "")
  if ("recruitment_type" in patch) set("type", patch.recruitment_type ?? "")
  if ("city" in patch) set("city", patch.city ?? "")
  if ("experience_level" in patch) set("experience", patch.experience_level ?? "")
  if ("birthYear" in patch) set("birth_year", patch.birthYear ?? "")
  if ("goatza" in patch) {
    if (patch.goatza) params.set("goatza", "1")
    else params.delete("goatza")
  }
}

function toApiParams(f: DiscoveryFilters): FetchRecruitmentsParams {
  const params: FetchRecruitmentsParams = {}
  if (f.search) params.search = f.search
  if (f.sport_id) params.sport_id = f.sport_id
  if (f.recruitment_type) params.recruitment_type = f.recruitment_type
  if (f.city) params.city = f.city
  if (f.experience_level) params.experience_level = f.experience_level
  if (/^\d+$/.test(f.birthYear)) params.birth_year = Number(f.birthYear)
  if (f.goatza) params.apply_method = "goatza"
  return params
}

// Active chip-filters (everything the chips/sheet control — not the search box).
function countActive(f: DiscoveryFilters): number {
  return [
    f.sport_id,
    f.recruitment_type,
    f.city,
    f.experience_level,
    f.birthYear,
    f.goatza ? "1" : "",
  ].filter(Boolean).length
}

const SKELETON_COUNT = 4

export default function RecruitmentDiscovery() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spString = searchParams.toString()

  const { data: sports = [] } = useSportsList()

  // URL is the source of truth for the applied filters.
  const committed = useMemo(
    () => readFilters(new URLSearchParams(spString)),
    [spString]
  )

  // Live working copy driving the desktop controls (text fields lead the URL
  // by the debounce window; selects/checkbox commit immediately).
  const [draft, setDraft] = useState<DiscoveryFilters>(committed)

  // Re-seed the draft from the URL, but only the fields that actually changed
  // since we last saw it. This lets external changes (chip removal, clear-all,
  // mobile "Apply", back/forward) flow into the controls WITHOUT clobbering a
  // field the user is mid-typing when a *different* filter commits.
  const prevCommitted = useRef(committed)
  useEffect(() => {
    const prev = prevCommitted.current
    prevCommitted.current = committed
    if (prev === committed) return
    setDraft((d) => {
      const next = { ...d }
      ;(Object.keys(committed) as (keyof DiscoveryFilters)[]).forEach((key) => {
        if (committed[key] !== prev[key]) {
          next[key] = committed[key] as never
        }
      })
      return next
    })
  }, [committed])

  const commit = useCallback(
    (patch: Partial<DiscoveryFilters>) => {
      const params = new URLSearchParams(spString)
      applyToParams(params, patch)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, spString]
  )

  // Debounced commit of the free-text fields (search / city / birth year).
  useEffect(() => {
    const timer = setTimeout(() => {
      const patch: Partial<DiscoveryFilters> = {}
      if (draft.search !== committed.search) patch.search = draft.search
      if (draft.city !== committed.city) patch.city = draft.city
      if (draft.birthYear !== committed.birthYear) patch.birthYear = draft.birthYear
      if (Object.keys(patch).length) commit(patch)
    }, 400)
    return () => clearTimeout(timer)
  }, [
    draft.search,
    draft.city,
    draft.birthYear,
    committed.search,
    committed.city,
    committed.birthYear,
    commit,
  ])

  // ── Handlers passed to the filter UI ──────────────────────────

  const handleTextChange = (
    patch: Partial<Pick<DiscoveryFilters, "search" | "city" | "birthYear">>
  ) => setDraft((d) => ({ ...d, ...patch }))

  const handleSelectChange = (patch: Partial<DiscoveryFilters>) => {
    setDraft((d) => ({ ...d, ...patch }))
    commit(patch)
  }

  const handleApplyAll = (next: DiscoveryFilters) => {
    setDraft(next)
    commit(next)
  }

  const handleRemoveChip = (key: keyof DiscoveryFilters) => {
    const patch: Partial<DiscoveryFilters> =
      key === "goatza" ? { goatza: false } : { [key]: "" }
    setDraft((d) => ({ ...d, ...patch }))
    commit(patch)
  }

  const handleClearAll = () => {
    setDraft(EMPTY_DISCOVERY_FILTERS)
    commit(EMPTY_DISCOVERY_FILTERS)
  }

  // ── Data ──────────────────────────────────────────────────────

  const apiParams = useMemo(() => toApiParams(committed), [committed])

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecruitmentsList(apiParams)

  const items = data?.pages.flatMap((p) => p.results) ?? []
  const totalCount = data?.pages[0]?.count ?? 0
  const activeCount = countActive(committed)
  const anyFilterActive = activeCount > 0 || committed.search !== ""

  return (
    <div className={styles.discovery}>
      <RecruitmentFilters
        draft={draft}
        committed={committed}
        sports={sports}
        activeCount={activeCount}
        onTextChange={handleTextChange}
        onSelectChange={handleSelectChange}
        onApplyAll={handleApplyAll}
        onRemoveChip={handleRemoveChip}
        onClearAll={handleClearAll}
      />

      {/* Loading (first page) */}
      {isLoading && (
        <div className={styles.list}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <RecruitmentCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && isError && (
        <div className={styles.stateBox} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={40} height={40} />
          <p className={styles.stateTitle}>Couldn&apos;t load recruitments</p>
          <p className={styles.stateBody}>
            Something went wrong. Please try again.
          </p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => refetch()}
          >
            <Icon icon="mdi:refresh" width={16} height={16} />
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && items.length === 0 && (
        <div className={styles.stateBox}>
          <div className={styles.stateIcon}>
            <Icon icon="mdi:whistle-outline" width={40} height={40} />
          </div>
          <p className={styles.stateTitle}>
            {anyFilterActive
              ? "No recruitments match your filters"
              : "No recruitments yet"}
          </p>
          <p className={styles.stateBody}>
            {anyFilterActive
              ? "Try adjusting or clearing your filters to see more."
              : "Check back soon — new opportunities are posted regularly."}
          </p>
          {anyFilterActive && (
            <button
              type="button"
              className={styles.retryBtn}
              onClick={handleClearAll}
            >
              <Icon icon="mdi:filter-remove-outline" width={16} height={16} />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <p className={styles.countHeader}>
            {totalCount} recruitment{totalCount !== 1 ? "s" : ""}
          </p>

          <div className={styles.list}>
            {items.map((item) => (
              <RecruitmentCard key={item.id} recruitment={item} />
            ))}
          </div>

          {hasNextPage && (
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
