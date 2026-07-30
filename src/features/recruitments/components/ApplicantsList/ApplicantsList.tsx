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
  useUpdateApplicationStatus,
} from "../../hooks/useRecruitments"
import HighlightsChip from "@/features/highlights/components/HighlightsChip/HighlightsChip"
import HighlightPipelineViewer, {
  type PipelinePlayer,
} from "@/features/highlights/components/HighlightPipelineViewer/HighlightPipelineViewer"
import HighlightViewerActions from "@/features/highlights/components/HighlightViewerActions/HighlightViewerActions"
import viewerActionStyles from "@/features/highlights/components/HighlightViewerActions/HighlightViewerActions.module.css"
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

// ── Shortlist from inside the viewer ───────────────────────────
// Reuses the pipeline's own single-status mutation, so the list behind the modal
// refreshes through the same invalidation the drawer relies on.
function ShortlistAction({
  applicationId,
  recruitmentId,
  status,
}: {
  applicationId?: string
  recruitmentId: string
  status?: ApplicationStatus
}) {
  const { mutate, isPending } = useUpdateApplicationStatus()
  const toast = useToast()

  if (!applicationId) return null

  // Past shortlisting (or out of the running) → nothing useful to offer.
  const settled =
    status === "shortlisted" ||
    status === "invited" ||
    status === "selected" ||
    status === "rejected" ||
    status === "withdrawn"

  if (settled) {
    return (
      <span className={`${viewerActionStyles.action} ${viewerActionStyles.actionDone}`}>
        <Icon
          icon={status ? APPLICATION_STATUS_META[status].icon : "mdi:check"}
          width={15}
          height={15}
        />
        {status ? APPLICATION_STATUS_META[status].label : "Done"}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`${viewerActionStyles.action} ${viewerActionStyles.actionPrimary}`}
      disabled={isPending}
      onClick={() =>
        mutate(
          { applicationId, recruitmentId, status: "shortlisted" },
          {
            onSuccess: () =>
              toast.show({ title: "Shortlisted", variant: "success" }),
            onError: (err) =>
              toast.show({
                title: getApiErrorMessage(err, "Couldn't shortlist."),
                variant: "error",
              }),
          }
        )
      }
    >
      {isPending ? (
        <span className={viewerActionStyles.actionSpinner} aria-hidden="true" />
      ) : (
        <Icon icon={APPLICATION_STATUS_META.shortlisted.icon} width={15} height={15} />
      )}
      Shortlist
    </button>
  )
}

function ApplicantRow({
  item,
  selectable,
  selected,
  onToggle,
  onOpen,
  onOpenHighlights,
}: {
  item: ApplicantListItem
  selectable: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onOpenHighlights: () => void
}) {
  const { applicant } = item
  const hasHighlights = (item.highlights_count ?? 0) > 0
  return (
    <div className={`${styles.rowCard} ${selectable ? styles.rowCardSelectable : ""} ${selected ? styles.rowCardSelected : ""} ${hasHighlights ? styles.rowCardWithChip : ""}`}>
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

      {/* Overlaid, and OUTSIDE the row button on purpose — a button inside a
          button is invalid HTML and steals the row's keyboard semantics. The
          count ships with the row, so this costs no request and no reflow (the
          row reserves its space via .rowCardWithChip). */}
      {hasHighlights && (
        <div className={styles.rowChip}>
          <HighlightsChip
            username={applicant.username}
            count={item.highlights_count}
            onOpen={onOpenHighlights}
          />
        </div>
      )}
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
  // Which player's reel the viewer starts on; null = viewer closed.
  const [reelStart, setReelStart] = useState<number | null>(null)
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
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "600px", threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const items = useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])

  /**
   * The reel queue, in list order: only applicants the viewer can actually watch
   * (count > 0), so the viewer never has to skip a player mid-review. `status`
   * rides along so the in-viewer Shortlist button knows what it's looking at.
   */
  const reelPlayers = useMemo<(PipelinePlayer & { status: ApplicationStatus })[]>(
    () =>
      items
        .filter((item) => (item.highlights_count ?? 0) > 0)
        .map((item) => ({
          username: item.applicant.username,
          name: item.shared_name || item.applicant.name,
          headline: item.applicant.headline,
          avatar: item.applicant.avatar,
          applicationId: item.id,
          status: item.status,
        })),
    [items]
  )

  /** Where a given applicant sits in that queue (-1 when they have no clips). */
  const reelIndexOf = useCallback(
    (applicationId: string) =>
      reelPlayers.findIndex((p) => p.applicationId === applicationId),
    [reelPlayers]
  )
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
                onOpenHighlights={() => {
                  const index = reelIndexOf(item.id)
                  if (index >= 0) setReelStart(index)
                }}
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

      {/* Reel review over the pipeline — the recruiter never leaves this list.
          Stage changes made in here invalidate the applicants query, so the list
          underneath is already correct when the modal closes. */}
      {reelStart !== null && reelPlayers.length > 0 && (
        <HighlightPipelineViewer
          players={reelPlayers}
          startIndex={reelStart}
          onClose={() => setReelStart(null)}
          renderActions={(player) => (
            <HighlightViewerActions username={player.username}>
              <ShortlistAction
                applicationId={player.applicationId}
                recruitmentId={recruitmentId}
                status={
                  reelPlayers.find(
                    (p) => p.applicationId === player.applicationId
                  )?.status
                }
              />
            </HighlightViewerActions>
          )}
        />
      )}
    </div>
  )
}
