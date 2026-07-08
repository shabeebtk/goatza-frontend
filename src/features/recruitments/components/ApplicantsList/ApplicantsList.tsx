"use client"

/**
 * ApplicantsList — org-admin list of a recruitment's applicants.
 *
 * Status filter chips (from status_counts) + debounced search, offset-paged
 * with infinite scroll. Multi-select → sticky bulk status bar; row click opens
 * the ApplicantDetailDrawer (single status change lives there). Withdrawn rows
 * are read-only (no checkbox, no bulk action).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import {
  useRecruitmentApplicants,
  useBulkUpdateApplicationStatus,
} from "../../hooks/useRecruitments"
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_ORDER,
} from "../../applicationStatus"
import type {
  ApplicationStatus,
  ApplicantListItem,
  BulkStatusTarget,
  StatusChangeSkip,
} from "../../services/recruitments.api"
import StatusBadge from "../StatusBadge/StatusBadge"
import ApplicantDetailDrawer from "../ApplicantDetailDrawer/ApplicantDetailDrawer"
import styles from "./ApplicantsList.module.css"

dayjs.extend(relativeTime)

type StatusFilter = ApplicationStatus | "all"

// Bulk multi-select targets (Invited is single-change only, in the drawer).
const BULK_ACTIONS: { status: BulkStatusTarget; label: string; verb: string }[] = [
  { status: "reviewing", label: "Reviewing", verb: "moved to reviewing" },
  { status: "shortlisted", label: "Shortlist", verb: "shortlisted" },
  { status: "selected", label: "Mark Selected", verb: "marked selected" },
  { status: "rejected", label: "Reject", verb: "rejected" },
]

const SKIP_LABEL: Record<StatusChangeSkip["reason"], string> = {
  withdrawn: "withdrawn",
  no_change: "already set",
  not_found: "not found",
}

function summarizeSkips(skips: StatusChangeSkip[]): string {
  return [...new Set(skips.map((s) => SKIP_LABEL[s.reason] ?? s.reason))].join(", ")
}

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

function ApplicantRow({
  item,
  selectable,
  selected,
  onToggle,
  onOpen,
}: {
  item: ApplicantListItem
  selectable: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { applicant } = item
  return (
    <div className={`${styles.rowCard} ${selectable ? styles.rowCardSelectable : ""} ${selected ? styles.rowCardSelected : ""}`}>
      {/* Round selector overlaid at the card's top-left (photo-gallery style).
          Withdrawn rows get no circle. stopPropagation so it never opens the drawer. */}
      {selectable && (
        <button
          className={styles.selectCircle}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          type="button"
          aria-pressed={selected}
          aria-label={selected
            ? `Deselect ${item.shared_name || applicant.name}`
            : `Select ${item.shared_name || applicant.name}`}
        >
          <span className={`${styles.selectDot} ${selected ? styles.selectDotOn : ""}`}>
            {selected && <Icon icon="mdi:check" width={12} height={12} />}
          </span>
        </button>
      )}

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
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────

export default function ApplicantsList({ recruitmentId }: { recruitmentId: string }) {
  const toast = useToast()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejectConfirm, setRejectConfirm] = useState(false)

  const { mutate: bulkUpdate, isPending: bulkPending } = useBulkUpdateApplicationStatus()

  // Debounce search (mirrors ConversationsList).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // A selection only makes sense within one filter/search view. Reset it the
  // moment that view changes — render-phase reset (React's recommended
  // alternative to a setState-in-effect), so it happens before paint.
  const viewKey = `${statusFilter}|${debouncedSearch}`
  const [selectionViewKey, setSelectionViewKey] = useState(viewKey)
  if (selectionViewKey !== viewKey) {
    setSelectionViewKey(viewKey)
    setSelected(new Set())
    setRejectConfirm(false)
  }

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

  const items = useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])
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

  // ── Selection ────────────────────────────────────────────────
  const selectableIds = useMemo(
    () => items.filter((i) => i.status !== "withdrawn").map((i) => i.id),
    [items]
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allOn = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id))
      return allOn ? new Set() : new Set(selectableIds)
    })
  }, [selectableIds])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setRejectConfirm(false)
  }, [])

  const runBulk = (action: (typeof BULK_ACTIONS)[number]) => {
    const applicationIds = [...selected]
    if (applicationIds.length === 0) return
    bulkUpdate(
      { recruitmentId, applicationIds, status: action.status },
      {
        onSuccess: (result) => {
          const n = result.updated.length
          const skipped = result.skipped.length
          toast.show({
            title: `${n} applicant${n === 1 ? "" : "s"} ${action.verb}`,
            message:
              skipped > 0
                ? `${skipped} skipped (${summarizeSkips(result.skipped)})`
                : undefined,
            variant: "success",
          })
          clearSelection()
        },
        onError: (err) => {
          toast.show({
            title: getApiErrorMessage(err, "Couldn't update applicants."),
            variant: "error",
          })
        },
      }
    )
  }

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

      {/* Select-all header (only when there are selectable rows) */}
      {!isLoading && !isError && selectableIds.length > 0 && (
        <div className={styles.selectAllRow}>
          <button
            className={`${styles.selectAllBtn} ${allSelected ? styles.selectAllBtnActive : ""}`}
            onClick={toggleAll}
            type="button"
            aria-pressed={allSelected}
          >
            <Icon
              icon={allSelected ? "mdi:check-circle" : "mdi:checkbox-blank-circle-outline"}
              width={16}
              height={16}
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </button>
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
              <ApplicantRow
                key={item.id}
                item={item}
                selectable={item.status !== "withdrawn"}
                selected={selected.has(item.id)}
                onToggle={() => toggleOne(item.id)}
                onOpen={() => setOpenApplicationId(item.id)}
              />
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

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkInfo}>
            <span className={styles.bulkCount}>{selected.size} selected</span>
            <button className={styles.bulkClear} onClick={clearSelection} type="button" disabled={bulkPending}>
              Clear
            </button>
          </div>

          {rejectConfirm ? (
            <div className={styles.bulkConfirm}>
              <span className={styles.bulkConfirmText}>
                Reject {selected.size} applicant{selected.size === 1 ? "" : "s"}?
              </span>
              <div className={styles.bulkConfirmActions}>
                <button
                  className={styles.bulkGhost}
                  onClick={() => setRejectConfirm(false)}
                  type="button"
                  disabled={bulkPending}
                >
                  Cancel
                </button>
                <button
                  className={styles.bulkDanger}
                  onClick={() => runBulk(BULK_ACTIONS[3])}
                  type="button"
                  disabled={bulkPending}
                >
                  {bulkPending
                    ? <span className={styles.bulkSpinner} aria-hidden="true" />
                    : <Icon icon={APPLICATION_STATUS_META.rejected.icon} width={15} height={15} />}
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.bulkActions}>
              {BULK_ACTIONS.map((action) => (
                <button
                  key={action.status}
                  className={`${styles.bulkBtn} ${action.status === "rejected" ? styles.bulkBtnDanger : ""}`}
                  onClick={() =>
                    action.status === "rejected" ? setRejectConfirm(true) : runBulk(action)
                  }
                  type="button"
                  disabled={bulkPending}
                >
                  {bulkPending
                    ? <span className={styles.bulkSpinner} aria-hidden="true" />
                    : <Icon icon={APPLICATION_STATUS_META[action.status].icon} width={15} height={15} />}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {openApplicationId && (
        <ApplicantDetailDrawer
          applicationId={openApplicationId}
          recruitmentId={recruitmentId}
          onClose={() => setOpenApplicationId(null)}
        />
      )}
    </div>
  )
}
