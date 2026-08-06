"use client"

/**
 * AchievementsSection
 *
 * Drops into UserProfile directly after CareerSection. Fetches its own data, so
 * UserProfile doesn't need to know about achievements.
 *
 * isOwn = true  → "Add" in the header, edit/delete/pin per card
 * isOwn = false → read-only, and the whole section disappears when empty —
 *                 an empty "Achievements" heading on someone else's profile is
 *                 worse than no heading at all. Same rule CareerSection uses.
 *
 * Takes a user ID, not a username: the endpoint is /achievements/users/<user_id>.
 * UserProfile has it as `profile.id`.
 */

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import {
    ACHIEVEMENTS_EMPTY_ICON,
    ACHIEVEMENTS_SECTION_ICON,
} from "../../achievementMeta"
import { usePublicSection } from "@/features/profile/context/PublicProfileContext"

import {
    useDeleteAchievement,
    useUpdateAchievement,
    useUserAchievements,
} from "../../hooks/useAchievementQueries"
import {
    ACHIEVEMENT_PAGE_SIZE,
    MAX_ACHIEVEMENTS,
    MAX_PINNED_ACHIEVEMENTS,
    type Achievement,
} from "../../types"
import AchievementCard from "../AchievementCard/AchievementCard"
import AchievementModal from "../AchievementModal/AchievementModal"
import styles from "./AchievementsSection.module.css"

// ── Delete confirm ────────────────────────────────────────────

function DeleteConfirm({
    achievement,
    deleting,
    onCancel,
    onConfirm,
}: {
    achievement: Achievement
    deleting: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    return (
        <div className={styles.deleteConfirm}>
            <p className={styles.deleteConfirmText}>
                Delete <strong>{achievement.title}</strong>? This can&apos;t be
                undone.
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

interface AchievementsSectionProps {
    /** The profile owner's user id (`profile.id`), not their username. */
    userId: string
    isOwn: boolean
}

type FormState =
    | { mode: "add" }
    | { mode: "edit"; achievement: Achievement }
    | null

export default function AchievementsSection({
    userId,
    isOwn,
}: AchievementsSectionProps) {
    // On a public profile the awards arrived with the server-rendered bundle;
    // passing null disables the query, which is IsAuthenticated. Same pattern
    // CareerSection uses.
    const publicAchievements = usePublicSection<Achievement>("achievements")

    const { data, isLoading, isError, refetch, isRefetching } =
        useUserAchievements(publicAchievements ? null : userId)
    const deleteAchievement = useDeleteAchievement()
    const updateAchievement = useUpdateAchievement()

    const sectionRef = useRef<HTMLDivElement>(null)
    const scrolledRef = useRef(false)

    /**
     * Land a `#achievements` deep link on this section.
     *
     * The browser's own fragment scroll runs at first paint, when this section
     * is still a skeleton somewhere else on the page — so by the time the real
     * cards render, the viewport is in the wrong place. Re-running the scroll
     * once the data has arrived is what actually gets an
     * achievement_verified / achievement_rejected notification to its target.
     *
     * Guarded to fire once: after that the page is the reader's to scroll.
     */
    useEffect(() => {
        if (scrolledRef.current) return
        if (isLoading || !sectionRef.current) return
        if (window.location.hash !== "#achievements") return

        scrolledRef.current = true
        sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }, [isLoading])

    const [form, setForm] = useState<FormState>(null)
    const [confirmingId, setConfirmingId] = useState<string | null>(null)
    const [pinningId, setPinningId] = useState<string | null>(null)
    // How many cards are on screen. Grows by ACHIEVEMENT_PAGE_SIZE per press and
    // never shrinks — collapsing back would yank the page out from under
    // someone who just scrolled down to read.
    const [visibleCount, setVisibleCount] = useState(ACHIEVEMENT_PAGE_SIZE)

    // The API's word on ownership beats comparing ids here: acting as an
    // organization never counts as owning your own profile. Fall back to the
    // prop while the request is still in flight. A logged-out visitor is never
    // the owner, whatever the prop says.
    const canManage = publicAchievements ? false : (data?.is_owner ?? isOwn)

    const achievements = publicAchievements ?? data?.results ?? []
    const pinnedCount = achievements.filter((a) => a.is_pinned).length

    const handleDelete = async (achievementId: string) => {
        try {
            await deleteAchievement.mutateAsync(achievementId)
        } finally {
            // The hook already toasts on failure; either way the confirm closes
            // rather than stranding the row in a half-committed state.
            setConfirmingId(null)
        }
    }

    /**
     * Pin/unpin is an ordinary PATCH — there is no separate endpoint.
     *
     * The pin cap is checked here before the request so the refusal is instant
     * and names the limit. The server enforces it too, and its message is what
     * surfaces if this check is ever wrong.
     */
    const handleTogglePin = async (achievement: Achievement) => {
        const nextPinned = !achievement.is_pinned

        if (nextPinned && pinnedCount >= MAX_PINNED_ACHIEVEMENTS) {
            toast.error(
                `You can pin up to ${MAX_PINNED_ACHIEVEMENTS} achievements. Unpin one to pin this.`
            )
            return
        }

        setPinningId(achievement.id)
        try {
            await updateAchievement.mutateAsync({
                achievementId: achievement.id,
                payload: { is_pinned: nextPinned },
            })
            toast.success(nextPinned ? "Pinned to your profile" : "Unpinned")
        } catch {
            // The hook already surfaced the server's message via sonner.
        } finally {
            setPinningId(null)
        }
    }

    // ── Loading ───────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Icon icon={ACHIEVEMENTS_SECTION_ICON} width={16} height={16} />
                        Achievements
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
                        <Icon icon={ACHIEVEMENTS_SECTION_ICON} width={16} height={16} />
                        Achievements
                    </h2>
                </div>
                <div className={styles.errorState}>
                    <Icon icon="mdi:cloud-off-outline" width={28} height={28} />
                    <p>Couldn&apos;t load these achievements.</p>
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

    // A visitor gets no heading at all when there is nothing under it.
    if (achievements.length === 0 && !canManage) return null

    const visible = achievements.slice(0, visibleCount)
    const remaining = achievements.length - visible.length
    const hasMore = remaining > 0
    const atCap = achievements.length >= MAX_ACHIEVEMENTS

    return (
        <>
            {/* `#achievements` is the anchor the achievement_verified /
                achievement_rejected notifications deep-link to. `scroll-margin`
                in the CSS keeps the heading clear of the sticky top nav; the
                effect above re-runs the scroll once the cards exist. */}
            <div className={styles.section} id="achievements" ref={sectionRef}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <Icon
                            icon={ACHIEVEMENTS_SECTION_ICON}
                            width={16}
                            height={16}
                            aria-hidden="true"
                        />
                        Achievements
                        {achievements.length > 0 && (
                            <span className={styles.sectionCount}>
                                {achievements.length}
                            </span>
                        )}
                    </h2>
                    {canManage && (
                        <button
                            className={styles.addBtn}
                            onClick={() => setForm({ mode: "add" })}
                            type="button"
                            aria-label="Add achievement"
                            disabled={atCap}
                            title={
                                atCap
                                    ? `You've reached the ${MAX_ACHIEVEMENTS}-achievement limit`
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
                        You&apos;ve reached the {MAX_ACHIEVEMENTS}-achievement limit.
                        Delete one to add another.
                    </p>
                )}

                {achievements.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Icon icon={ACHIEVEMENTS_EMPTY_ICON} width={36} height={36} />
                        <p className={styles.emptyTitle}>Show what you&apos;ve won</p>
                        <p className={styles.emptyText}>
                            Add your first achievement — trophies, individual awards,
                            records, milestones and coaching certifications.
                        </p>
                        <button
                            className={styles.emptyAddBtn}
                            onClick={() => setForm({ mode: "add" })}
                            type="button"
                        >
                            <Icon icon="mdi:plus" width={16} height={16} />
                            Add achievement
                        </button>
                    </div>
                ) : (
                    <>
                        <div className={styles.grid}>
                            {visible.map((achievement) =>
                                confirmingId === achievement.id ? (
                                    <DeleteConfirm
                                        key={achievement.id}
                                        achievement={achievement}
                                        deleting={deleteAchievement.isPending}
                                        onCancel={() => setConfirmingId(null)}
                                        onConfirm={() => handleDelete(achievement.id)}
                                    />
                                ) : (
                                    <AchievementCard
                                        key={achievement.id}
                                        achievement={achievement}
                                        isOwn={canManage}
                                        pinning={pinningId === achievement.id}
                                        onEdit={(target) =>
                                            setForm({ mode: "edit", achievement: target })
                                        }
                                        onDelete={(target) =>
                                            setConfirmingId(target.id)
                                        }
                                        onTogglePin={handleTogglePin}
                                    />
                                )
                            )}
                        </div>

                        {hasMore && (
                            <button
                                className={styles.showMoreBtn}
                                onClick={() =>
                                    setVisibleCount((n) => n + ACHIEVEMENT_PAGE_SIZE)
                                }
                                type="button"
                            >
                                <Icon icon="mdi:chevron-down" width={16} height={16} />
                                Show {Math.min(ACHIEVEMENT_PAGE_SIZE, remaining)} more
                                <span className={styles.showMoreCount}>
                                    of {remaining}
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>

            {form && canManage && (
                <AchievementModal
                    achievement={form.mode === "edit" ? form.achievement : undefined}
                    pinnedCount={pinnedCount}
                    onClose={() => setForm(null)}
                />
            )}
        </>
    )
}
