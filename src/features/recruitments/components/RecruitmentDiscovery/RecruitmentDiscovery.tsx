"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import { useSportsList } from "@/features/profile/hooks/useSportsQueries"
import {
  useRecruitmentDiscover,
  useRecruitmentsList,
} from "../../hooks/useRecruitments"
import type { FetchRecruitmentsParams } from "../../services/recruitments.api"
import {
  CLOSING_SOON_DAYS,
  DEFAULT_DISTANCE_KM,
  EMPTY_DISCOVERY_FILTERS,
  NEW_THIS_WEEK_DAYS,
  type DiscoveryFilters,
} from "../../filterOptions"
import { MISSING_FIELD_META, profileFieldHref } from "../../matchContext"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import RecruitmentFilters from "./RecruitmentFilters"
import RecruitmentRail from "./RecruitmentRail"
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
    positionId: sp.get("position") ?? "",
    distanceKm: sp.get("distance") ?? "",
    forMe: sp.get("for_me") === "1",
    closingWithinDays: sp.get("closing_in") ?? "",
    publishedWithinDays: sp.get("posted_in") ?? "",
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
  const setFlag = (key: string, value: boolean | undefined) => {
    if (value) params.set(key, "1")
    else params.delete(key)
  }
  if ("search" in patch) set("search", patch.search ?? "")
  if ("sport_id" in patch) set("sport", patch.sport_id ?? "")
  if ("recruitment_type" in patch) set("type", patch.recruitment_type ?? "")
  if ("city" in patch) set("city", patch.city ?? "")
  if ("experience_level" in patch) set("experience", patch.experience_level ?? "")
  if ("birthYear" in patch) set("birth_year", patch.birthYear ?? "")
  if ("goatza" in patch) setFlag("goatza", patch.goatza)
  if ("positionId" in patch) set("position", patch.positionId ?? "")
  if ("distanceKm" in patch) set("distance", patch.distanceKm ?? "")
  if ("forMe" in patch) setFlag("for_me", patch.forMe)
  if ("closingWithinDays" in patch) set("closing_in", patch.closingWithinDays ?? "")
  if ("publishedWithinDays" in patch) set("posted_in", patch.publishedWithinDays ?? "")
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
  // A position only makes sense inside a sport; the select is disabled without
  // one, so an orphaned value from a hand-edited URL is dropped here too.
  if (f.positionId && f.sport_id) params.position_id = f.positionId
  if (/^\d+$/.test(f.distanceKm)) params.max_distance_km = Number(f.distanceKm)
  if (f.forMe) params.age_eligible = true
  if (/^\d+$/.test(f.closingWithinDays)) {
    params.closing_within_days = Number(f.closingWithinDays)
  }
  if (/^\d+$/.test(f.publishedWithinDays)) {
    params.published_within_days = Number(f.publishedWithinDays)
  }
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
    f.positionId,
    f.distanceKm,
    f.closingWithinDays,
    f.publishedWithinDays,
    f.goatza ? "1" : "",
    f.forMe ? "1" : "",
  ].filter(Boolean).length
}

const SKELETON_COUNT = 4

// Below this, the "All" list is thin enough that pointing somewhere else is
// more useful than another empty scroll (§5 low supply).
const LOW_SUPPLY_THRESHOLD = 3

// The curated trials board account, configured per environment. Left unset the
// low-supply block simply omits the link rather than shipping a dead one.
const TRIALS_BOARD_USERNAME =
  process.env.NEXT_PUBLIC_TRIALS_BOARD_USERNAME ?? ""

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
    // Changing sport invalidates the position under it — clear both together
    // so the URL never holds a position from a sport that is no longer chosen.
    const next =
      "sport_id" in patch ? { ...patch, positionId: "" } : patch
    setDraft((d) => ({ ...d, ...next }))
    commit(next)
  }

  const handleApplyAll = (next: DiscoveryFilters) => {
    setDraft(next)
    commit(next)
  }

  const handleRemoveChip = (key: keyof DiscoveryFilters) => {
    const patch: Partial<DiscoveryFilters> =
      key === "goatza" || key === "forMe"
        ? ({ [key]: false } as Partial<DiscoveryFilters>)
        : key === "sport_id"
          ? { sport_id: "", positionId: "" }
          : ({ [key]: "" } as Partial<DiscoveryFilters>)
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

  const { data: discover } = useRecruitmentDiscover()

  const items = data?.pages.flatMap((p) => p.results) ?? []
  const totalCount = data?.pages[0]?.count ?? 0
  const activeCount = countActive(committed)
  const anyFilterActive = activeCount > 0 || committed.search !== ""

  // The rails are the unfiltered personalized view; once the reader is
  // filtering, they are answering a different question and the rails would
  // just be noise above the answer.
  const showRails = !anyFilterActive && !!discover

  const missingFields = discover?.missing_profile_fields ?? []
  const distanceRadius = discover?.max_distance_km ?? DEFAULT_DISTANCE_KM

  // "See all" targets: each rail's own rule, expressed as list filters.
  const railHref = (patch: Partial<DiscoveryFilters>) => {
    const params = new URLSearchParams(spString)
    applyToParams(params, patch)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}#all` : `${pathname}#all`
  }

  return (
    <div className={styles.discovery}>
      {/* ── Profile completion (§5) ──
          Named fields, not a generic nudge: each one genuinely weakens the
          score, so the prompt can afford to be specific — and has to be, to
          be honest. */}
      {missingFields.length > 0 && (
        <div className={styles.profilePrompt}>
          <span className={styles.profilePromptIcon} aria-hidden="true">
            <Icon icon="mdi:account-cog-outline" width={20} height={20} />
          </span>
          <div className={styles.profilePromptBody}>
            <p className={styles.profilePromptTitle}>
              Complete your profile to get better matches
            </p>
            <p className={styles.profilePromptText}>
              We&apos;re still missing{" "}
              {missingFields
                .map((field) => MISSING_FIELD_META[field]?.label ?? field)
                .join(", ")}
              .
            </p>
            <div className={styles.profilePromptLinks}>
              {missingFields.map((field) => (
                <Link
                  key={field}
                  href={profileFieldHref(field)}
                  className={styles.profilePromptLink}
                >
                  Add {MISSING_FIELD_META[field]?.label ?? field}
                  <Icon icon="mdi:arrow-right" width={13} height={13} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Sections (§5) — each self-hides when empty ── */}
      {showRails && discover && (
        <>
          <RecruitmentRail
            title="Recommended for you"
            subtitle="Your best matches right now"
            icon="mdi:star-four-points-outline"
            items={discover.recommended}
            seeAllHref={railHref({})}
          />
          <RecruitmentRail
            title="Closing soon"
            subtitle={`Applications close within ${CLOSING_SOON_DAYS} days`}
            icon="mdi:timer-sand"
            items={discover.closing_soon}
            seeAllHref={railHref({
              closingWithinDays: String(CLOSING_SOON_DAYS),
            })}
          />
          <RecruitmentRail
            title="Near you"
            subtitle={`Within ${distanceRadius} km`}
            icon="mdi:map-marker-radius-outline"
            items={discover.near_you}
            seeAllHref={railHref({ distanceKm: String(distanceRadius) })}
          />
          <RecruitmentRail
            title="New this week"
            subtitle="Just posted"
            icon="mdi:new-box"
            items={discover.new_this_week}
            seeAllHref={railHref({
              publishedWithinDays: String(NEW_THIS_WEEK_DAYS),
            })}
          />
        </>
      )}

      {/* ── All ── */}
      <div id="all" className={styles.allSection}>
        {showRails && <h2 className={styles.allHeading}>All recruitments</h2>}

        <RecruitmentFilters
          draft={draft}
          committed={committed}
          sports={sports}
          activeCount={activeCount}
          canFilterByDistance={!missingFields.includes("location")}
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

        {/* ── Low supply (§5) ──
            Not an error state: there just isn't much here yet. Point at the
            curated board rather than leaving the reader at a dead end. */}
        {!isLoading &&
          !isError &&
          totalCount < LOW_SUPPLY_THRESHOLD &&
          TRIALS_BOARD_USERNAME && (
            <div className={styles.lowSupply}>
              <Icon icon="mdi:clipboard-list-outline" width={18} height={18} />
              <p className={styles.lowSupplyText}>
                Not many trials here yet. The{" "}
                <Link
                  href={`/organization/profile/${TRIALS_BOARD_USERNAME}`}
                  className={styles.lowSupplyLink}
                >
                  Goatza trials board
                </Link>{" "}
                posts openings from across the country.
              </p>
            </div>
          )}
      </div>
    </div>
  )
}
