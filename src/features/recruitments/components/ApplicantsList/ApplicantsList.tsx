"use client"

/**
 * ApplicantsList — org-admin, read-only list of a recruitment's applicants.
 *
 * Status filter chips (from status_counts) + debounced search, offset-paged
 * with infinite scroll (mirrors RecruitmentsList). Row click opens the
 * read-only ApplicantDetailDrawer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useRecruitmentApplicants } from "../../hooks/useRecruitments"
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_ORDER,
} from "../../applicationStatus"
import type { ApplicationStatus, ApplicantListItem } from "../../services/recruitments.api"
import StatusBadge from "../StatusBadge/StatusBadge"
import ApplicantDetailDrawer from "../ApplicantDetailDrawer/ApplicantDetailDrawer"
import styles from "./ApplicantsList.module.css"

dayjs.extend(relativeTime)

type StatusFilter = ApplicationStatus | "all"

// ── Row skeleton (mirrors RecruitmentCardSkeleton shimmer) ─────

function ApplicantRowSkeleton() {
  return (
    <div className={styles.row} aria-hidden="true">
      <div className={styles.avatarSkeleton} />
      <div className={styles.rowMain}>
        <div className={`${styles.shimmer} ${styles.lineName}`} />
        <div className={`${styles.shimmer} ${styles.lineSub}`} />
      </div>
      <div className={`${styles.shimmer} ${styles.badgeSkeleton}`} />
    </div>
  )
}

// ── Applicant row ──────────────────────────────────────────────

function ApplicantRow({ item, onOpen }: { item: ApplicantListItem; onOpen: () => void }) {
  const { applicant } = item
  return (
    <button className={styles.row} onClick={onOpen} type="button">
      <Avatar
        src={applicant.avatar}
        initials={(item.shared_name || applicant.name)?.slice(0, 2).toUpperCase()}
        size="md"
      />
      <div className={styles.rowMain}>
        <div className={styles.rowTop}>
          <span className={styles.name}>{item.shared_name || applicant.name}</span>
          {applicant.username && <span className={styles.username}>@{applicant.username}</span>}
        </div>
        {applicant.headline && <span className={styles.headline}>{applicant.headline}</span>}
        <span className={styles.appliedAt}>
          <Icon icon="mdi:clock-outline" width={12} height={12} />
          Applied {dayjs(item.applied_at).fromNow()}
        </span>
      </div>
      <div className={styles.rowRight}>
        <StatusBadge status={item.status} />
        <Icon icon="mdi:chevron-right" width={18} height={18} className={styles.rowChevron} />
      </div>
    </button>
  )
}

// ── Main ───────────────────────────────────────────────────────

export default function ApplicantsList({ recruitmentId }: { recruitmentId: string }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)

  // Debounce search (mirrors ConversationsList).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const {
    data,
    isLoading,
    isError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useRecruitmentApplicants(recruitmentId, {
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch || undefined,
  })

  // ── Infinite scroll ──────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "200px", threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const items = data?.pages.flatMap((p) => p.results) ?? []
  const statusCounts = data?.pages[0]?.status_counts
  const totalApplicants = useMemo(
    () => (statusCounts ? Object.values(statusCounts).reduce((s, n) => s + n, 0) : 0),
    [statusCounts]
  )

  // Chips: All + only statuses that have at least one applicant.
  const chips = useMemo(() => {
    const list: { value: StatusFilter; label: string; count: number }[] = [
      { value: "all", label: "All", count: totalApplicants },
    ]
    if (statusCounts) {
      for (const status of APPLICATION_STATUS_ORDER) {
        const count = statusCounts[status] ?? 0
        if (count > 0) list.push({ value: status, label: APPLICATION_STATUS_META[status].label, count })
      }
    }
    return list
  }, [statusCounts, totalApplicants])

  const filtersActive = statusFilter !== "all" || debouncedSearch.length > 0

  return (
    <div className={styles.wrapper}>
      {/* Search */}
      <div className={styles.searchWrap}>
        <Icon icon="mdi:magnify" width={18} height={18} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or @username"
          type="search"
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch("")} type="button" aria-label="Clear search">
            <Icon icon="mdi:close" width={15} height={15} />
          </button>
        )}
      </div>

      {/* Status chips */}
      {chips.length > 1 && (
        <div className={styles.chipRow}>
          {chips.map((chip) => (
            <button
              key={chip.value}
              className={`${styles.chip} ${statusFilter === chip.value ? styles.chipActive : ""}`}
              onClick={() => setStatusFilter(chip.value)}
              type="button"
            >
              {chip.label}
              <span className={styles.chipCount}>{chip.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* States */}
      {isLoading ? (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => <ApplicantRowSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className={styles.errorState}>
          <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
          <p>Failed to load applicants.</p>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Icon icon="mdi:account-multiple-outline" width={40} height={40} />
          </div>
          <p className={styles.emptyTitle}>
            {filtersActive ? "No matching applicants" : "No applicants yet"}
          </p>
          <p className={styles.emptyBody}>
            {filtersActive
              ? "Try a different status or search term."
              : "Applications will appear here as players apply."}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {items.map((item) => (
              <ApplicantRow key={item.id} item={item} onOpen={() => setOpenApplicationId(item.id)} />
            ))}
          </div>

          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          {isFetchingNextPage && (
            <div className={styles.loadingMore}>
              <span className={styles.loadingSpinner} aria-hidden="true" />
              <span className={styles.loadingText}>Loading more…</span>
            </div>
          )}
          {!hasNextPage && items.length > 0 && (
            <div className={styles.endOfList}>
              <span className={styles.endDot} />
              <span>All applicants loaded</span>
              <span className={styles.endDot} />
            </div>
          )}
        </>
      )}

      {openApplicationId && (
        <ApplicantDetailDrawer
          applicationId={openApplicationId}
          onClose={() => setOpenApplicationId(null)}
        />
      )}
    </div>
  )
}
