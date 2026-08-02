"use client"

/**
 * CareerSection
 *
 * Drop into UserProfile alongside UserSportsSection. Fetches its own data, so
 * UserProfile doesn't need to know about careers.
 *
 * isOwn = true  → "Add" in the header, edit/delete per entry, and the
 *                 verification hints (pending / not verified)
 * isOwn = false → read-only, and the whole section disappears when empty —
 *                 an empty "Career" heading on someone else's profile is worse
 *                 than no heading at all.
 *
 * Takes a user ID, not a username: the endpoint is /careers/users/<user_id>.
 * UserProfile has it as `profile.id`.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import {
    useDeleteCareerEntry,
    useUserCareer,
} from "../../hooks/useCareerQueries"
import {
    CAREER_PAGE_SIZE,
    MAX_CAREER_ENTRIES,
    type CareerEntry,
} from "../../types"
import CareerEntryCard from "../CareerEntryCard/CareerEntryCard"
import CareerEntryModal from "../CareerEntryModal/CareerEntryModal"
import styles from "./CareerSection.module.css"

// ── Delete confirm ────────────────────────────────────────────

function DeleteConfirm({
    entry,
    deleting,
    onCancel,
    onConfirm,
}: {
    entry: CareerEntry
    deleting: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <div className={styles.deleteConfirm}>
            <p className={styles.deleteConfirmText}>
                Delete <strong>{entry.title}</strong> at{" "}
                <strong>{entry.organization_name}</strong>? This can&apos;t be undone.
            </p>
            <div className={styles.deleteConfirmActions}>
                <button
                    className={styles.deleteConfirmCancel}
                    onClick={onCancel}
                    type="button"
                    disabled={deleting}
                >
                    Cancel
                </button>
                <button
                    className={styles.deleteConfirmOk}
                    onClick={onConfirm}
                    type="button"
                    disabled={deleting}
                >
                    {deleting ? (
                        <>
                            <span className={styles.miniSpinner} aria-hidden="true" />
                            Deleting…
                        </>
                    ) : (
                        "Delete"
                    )}
                </button>
            </div>
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────

interface CareerSectionProps {
    /** The profile owner's user id (`profile.id`), not their username. */
    userId: string
    isOwn: boolean
}

type FormState = { mode: "add" } | { mode: "edit"; entry: CareerEntry } | null

export default function CareerSection({ userId, isOwn }: CareerSectionProps) {
    const { data, isLoading, isError, refetch, isRefetching } =
        useUserCareer(userId)
    const deleteEntry = useDeleteCareerEntry()

    const [form, setForm] = useState<FormState>(null)
    const [confirmingId, setConfirmingId] = useState<string | null>(null)
    // How many entries are on screen. Grows by CAREER_PAGE_SIZE per press and
    // never shrinks — collapsing back would yank the page out from under
    // someone who just scrolled down to read.
    const [visibleCount, setVisibleCount] = useState(CAREER_PAGE_SIZE)

    // The API's word on ownership beats comparing ids here: acting as an
    // organization never counts as owning your own history. Fall back to the
    // prop while the request is still in flight.
    const canManage = data?.is_owner ?? isOwn

    const handleDelete = async (entryId: string) => {
        try {
            await deleteEntry.mutateAsync(entryId)
        } finally {
            // The hook already toasts on failure; either way the confirm closes
            // rather than stranding the row in a half-committed state.
            setConfirmingId(null)
        }
    }

    // ── Loading ───────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Icon icon="mdi:timeline-text-outline" width={16} height={16} />
                        Career
                    </h2>
                </div>
                <div className={styles.skeleton}>
                    <div className={styles.skeletonCard} />
                    <div className={styles.skeletonCard} />
                </div>
            </div>
        )
    }

    // ── Error ─────────────────────────────────────────────────
    if (isError) {
        return (
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Icon icon="mdi:timeline-text-outline" width={16} height={16} />
                        Career
                    </h2>
                </div>
                <div className={styles.errorState}>
                    <Icon icon="mdi:cloud-off-outline" width={28} height={28} />
                    <p>Couldn&apos;t load this career history.</p>
                    <button
                        className={styles.retryBtn}
                        onClick={() => refetch()}
                        type="button"
                        disabled={isRefetching}
                    >
                        {isRefetching ? "Retrying…" : "Try again"}
                    </button>
                </div>
            </div>
        )
    }

    const entries = data?.results ?? []

    // A visitor gets no heading at all when there is nothing under it.
    if (entries.length === 0 && !canManage) return null

    const visible = entries.slice(0, visibleCount)
    const remaining = entries.length - visible.length
    const hasMore = remaining > 0
    const atCap = entries.length >= MAX_CAREER_ENTRIES

    return (
        <>
            {/* `#career` is the anchor the career_verified / career_rejected
                notifications deep-link to. */}
            <div className={styles.section} id="career">
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Icon
                            icon="mdi:timeline-text-outline"
                            width={16}
                            height={16}
                            aria-hidden="true"
                        />
                        Career
                    </h2>
                    {canManage && (
                        <button
                            className={styles.addBtn}
                            onClick={() => setForm({ mode: "add" })}
                            type="button"
                            aria-label="Add career entry"
                            disabled={atCap}
                            title={
                                atCap
                                    ? `You've reached the ${MAX_CAREER_ENTRIES}-entry limit`
                                    : undefined
                            }
                        >
                            <Icon icon="mdi:plus" width={16} height={16} />
                            Add
                        </button>
                    )}
                </div>

                {canManage && atCap && (
                    <p className={styles.capNote}>
                        You&apos;ve reached the {MAX_CAREER_ENTRIES}-entry limit.
                        Delete one to add another.
                    </p>
                )}

                {entries.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Icon icon="mdi:timeline-plus-outline" width={36} height={36} />
                        <p className={styles.emptyTitle}>Showcase your journey</p>
                        <p className={styles.emptyText}>
                            Add your first career entry — clubs, academies, national
                            call-ups and coaching roles.
                        </p>
                        <button
                            className={styles.emptyAddBtn}
                            onClick={() => setForm({ mode: "add" })}
                            type="button"
                        >
                            <Icon icon="mdi:plus" width={16} height={16} />
                            Add career entry
                        </button>
                    </div>
                ) : (
                    <>
                        <div className={styles.timeline}>
                            {visible.map((entry, index) =>
                                confirmingId === entry.id ? (
                                    <DeleteConfirm
                                        key={entry.id}
                                        entry={entry}
                                        deleting={deleteEntry.isPending}
                                        onCancel={() => setConfirmingId(null)}
                                        onConfirm={() => handleDelete(entry.id)}
                                    />
                                ) : (
                                    <CareerEntryCard
                                        key={entry.id}
                                        entry={entry}
                                        isOwn={canManage}
                                        // The rail's tail stops at the last VISIBLE
                                        // card; with more to come, "Show more"
                                        // continues the line instead.
                                        isLast={
                                            index === visible.length - 1 && !hasMore
                                        }
                                        onEdit={(target) =>
                                            setForm({ mode: "edit", entry: target })
                                        }
                                        onDelete={(target) =>
                                            setConfirmingId(target.id)
                                        }
                                    />
                                )
                            )}
                        </div>

                        {hasMore && (
                            <button
                                className={styles.showMoreBtn}
                                onClick={() =>
                                    setVisibleCount((n) => n + CAREER_PAGE_SIZE)
                                }
                                type="button"
                            >
                                <Icon icon="mdi:chevron-down" width={16} height={16} />
                                Show {Math.min(CAREER_PAGE_SIZE, remaining)} more
                                <span className={styles.showMoreCount}>
                                    of {remaining}
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>

            {form && canManage && (
                <CareerEntryModal
                    entry={form.mode === "edit" ? form.entry : undefined}
                    onClose={() => setForm(null)}
                />
            )}
        </>
    )
}
