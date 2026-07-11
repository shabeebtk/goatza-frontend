"use client"

import { useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Icon } from "@iconify/react"
import { useMyApplications } from "../../hooks/useRecruitments"
import type {
  ApplicationStatus,
  FetchMyApplicationsParams,
} from "../../services/recruitments.api"
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_ORDER,
} from "../../applicationStatus"
import ApplicationCard from "./ApplicationCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import styles from "./MyApplications.module.css"

function isStatus(value: string | null): value is ApplicationStatus {
  return !!value && (APPLICATION_STATUS_ORDER as string[]).includes(value)
}

const SKELETON_COUNT = 3

interface MyApplicationsProps {
  /** Empty-state CTA — switches the page to the discovery tab. */
  onBrowse: () => void
}

export default function MyApplications({ onBrowse }: MyApplicationsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const spString = searchParams.toString()

  const status = useMemo(() => {
    const raw = new URLSearchParams(spString).get("status")
    return isStatus(raw) ? raw : undefined
  }, [spString])

  const setStatus = (next?: ApplicationStatus) => {
    const params = new URLSearchParams(spString)
    if (next) params.set("status", next)
    else params.delete("status")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const apiParams: FetchMyApplicationsParams = status ? { status } : {}

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMyApplications(apiParams)

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data]
  )
  const totalCount = data?.pages[0]?.count ?? 0

  return (
    <div className={styles.applications}>
      <div
        className={styles.statusChips}
        role="tablist"
        aria-label="Filter applications by status"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!status}
          className={`${styles.statusChip} ${!status ? styles.statusChipActive : ""}`}
          onClick={() => setStatus(undefined)}
        >
          All
        </button>
        {APPLICATION_STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={`${styles.statusChip} ${status === s ? styles.statusChipActive : ""}`}
            onClick={() => setStatus(s)}
          >
            {APPLICATION_STATUS_META[s].label}
          </button>
        ))}
      </div>

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
          <p className={styles.stateTitle}>Couldn&apos;t load your applications</p>
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
            <Icon icon="mdi:file-document-outline" width={40} height={40} />
          </div>
          <p className={styles.stateTitle}>
            {status
              ? "No applications with this status"
              : "You haven't applied to any recruitments yet"}
          </p>
          <p className={styles.stateBody}>
            {status
              ? "Try a different status filter to see more."
              : "Browse open recruitments and apply to get started."}
          </p>
          {status ? (
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => setStatus(undefined)}
            >
              Show all
            </button>
          ) : (
            <button
              type="button"
              className={styles.retryBtn}
              onClick={onBrowse}
            >
              <Icon icon="mdi:compass-outline" width={16} height={16} />
              Browse recruitments
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {!isLoading && !isError && items.length > 0 && (
        <>
          <p className={styles.countHeader}>
            {totalCount} application{totalCount !== 1 ? "s" : ""}
          </p>

          <div className={styles.list}>
            {items.map((app) => (
              <ApplicationCard key={app.id} application={app} />
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
