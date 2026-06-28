"use client"

/**
 * RecruitmentsList
 *
 * Reusable for both:
 *   - Organization profile tab:  <RecruitmentsList username="dreamfccalicut" isOwn />
 *   - Global discover page:      <RecruitmentsList />
 *   - Preview (profile header):  <RecruitmentsList username="dreamfccalicut" preview />
 *
 * Props:
 *   username    — filter by org (omit for global feed)
 *   isOwn       — shows "Create Recruitment" CTA in empty state
 *   onCreate    — called when CTA button clicked
 *   preview     — shows only 1 card + "View All" link
 *   showOrg     — pass false when inside org profile (card already shows context)
 */

import { useEffect, useRef, useCallback, useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import RecruitmentCard from "../RecruitmentCard/RecruitmentCard"
import RecruitmentCardSkeleton from "../RecruitmentCard/RecruitmentCardSkeleton"
import { useRecruitmentsList } from "../../hooks/useRecruitments"
import type { FetchRecruitmentsParams } from "../../services/recruitments.api"
import { useNavigation } from "@/shared/services/navigation.service"
import styles from "./RecruitmentsList.module.css"
import CreateRecruitmentTrigger from "../CreateRecruitmentModal/CreateRecruitmentTrigger"

// ── Empty state ───────────────────────────────────────────────

function EmptyState({
    isOwn,
    onCreate,
}: {
    isOwn: boolean
    onCreate?: () => void
}) {
    return (
        <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
                <Icon icon="mdi:whistle-outline" width={44} height={44} />
            </div>
            <p className={styles.emptyTitle}>No recruitments yet</p>
            {isOwn ? (
                <>
                    <p className={styles.emptyBody}>
                        Post open trials, private trials, or scholarship calls to find the best talent.
                    </p>
                    <CreateRecruitmentTrigger>
                        {(open) => (
                            <button className={styles.createBtn} onClick={open} type="button">
                                <Icon icon="mdi:plus" width={16} height={16} />
                                Post Recruitment
                            </button>
                        )}
                    </CreateRecruitmentTrigger>
                </>
            ) : (
                <p className={styles.emptyBody}>No active recruitments at the moment.</p>
            )}
        </div>
    )
}

// ── Loading more ──────────────────────────────────────────────

function LoadingMore() {
    return (
        <div className={styles.loadingMore}>
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <span className={styles.loadingText}>Loading more…</span>
        </div>
    )
}

// ── End of list ───────────────────────────────────────────────

function EndOfList() {
    return (
        <div className={styles.endOfList}>
            <span className={styles.endDot} />
            <span>All recruitments loaded</span>
            <span className={styles.endDot} />
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────

interface RecruitmentsListProps {
    username?: string
    isOwn?: boolean
    onCreate?: () => void
    preview?: boolean
    showOrg?: boolean
}

export default function RecruitmentsList({
    username,
    isOwn = false,
    onCreate,
    preview = false,
    showOrg = true,
}: RecruitmentsListProps) {
    const { toRecruitmentsList } = useNavigation()

    const queryParams: FetchRecruitmentsParams = {}
    if (username) queryParams.username = username

    const [showModal, setShowModal] = useState(false)

    const {
        data,
        isLoading,
        isError,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useRecruitmentsList(queryParams, preview ? 1 : undefined)

    // ── Infinite scroll ───────────────────────────────────────────
    const sentinelRef = useRef<HTMLDivElement>(null)

    const handleObserver = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [entry] = entries
            if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage()
            }
        },
        [fetchNextPage, hasNextPage, isFetchingNextPage]
    )

    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const observer = new IntersectionObserver(handleObserver, {
            rootMargin: "200px",
            threshold: 0,
        })
        observer.observe(el)
        return () => observer.disconnect()
    }, [handleObserver])

    // ── Flatten pages ─────────────────────────────────────────────
    const allItems = data?.pages.flatMap((p) => p.results) ?? []
    const totalCount = data?.pages[0]?.count ?? 0
    const displayItems = preview ? allItems.slice(0, 1) : allItems

    // ── Loading ───────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className={styles.list}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <RecruitmentCardSkeleton key={i} />
                ))}
            </div>
        )
    }

    // ── Error ─────────────────────────────────────────────────────
    if (isError) {
        return (
            <div className={styles.errorState}>
                <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
                <p>Failed to load recruitments.</p>
            </div>
        )
    }

    // ── Empty ─────────────────────────────────────────────────────
    if (allItems.length === 0) {
        return <EmptyState isOwn={isOwn} onCreate={onCreate} />
    }

    return (
        <div className={styles.wrapper}>

            {!preview && isOwn && (
                <div className={styles.listHeader}>
                    <p className={styles.countHeader}>
                        {totalCount > 0 ? `${totalCount} recruitment${totalCount !== 1 ? "s" : ""}` : "Recruitments"}
                    </p>
                    <CreateRecruitmentTrigger>
                        {(open) => (
                            <button className={styles.createBtn} onClick={open} type="button">
                                <Icon icon="mdi:plus" width={16} height={16} />
                                Post Recruitment
                            </button>
                        )}
                    </CreateRecruitmentTrigger>
                </div>
            )}

            {/* Preview header */}
            {preview && username && (
                <div className={styles.previewHeader}>
                    <h2 className={styles.previewTitle}>Recruitments</h2>
                    {totalCount > 1 && (
                        <Link
                            href={toRecruitmentsList(username)}
                            className={styles.viewAllBtn}
                        >
                            View All {totalCount}
                            <Icon icon="mdi:arrow-right" width={15} height={15} />
                        </Link>
                    )}
                </div>
            )}


            <div className={styles.list}>
                {displayItems.map((item) => (
                    <RecruitmentCard
                        key={item.id}
                        recruitment={item}
                        showOrg={showOrg}
                    />
                ))}
            </div>

            {/* Infinite scroll — full mode only */}
            {!preview && (
                <>
                    <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
                    {isFetchingNextPage && <LoadingMore />}
                    {!hasNextPage && allItems.length > 0 && <EndOfList />}
                </>
            )}




        </div>
    )
}