"use client"

/**
 * AchievementsListPage — one player's WHOLE award shelf, on its own page.
 *
 * The profile's AchievementsSection pages in threes, which is right for a
 * profile: the section is one of a dozen on that screen. Past ten awards,
 * paging a section three at a time stops being a section and becomes a list,
 * so it hands over to this.
 *
 * Reuses AchievementCard exactly as the section renders it — verification
 * badge, pin, owner controls and all. The pin cap is enforced here the same
 * way the section enforces it, because it is a rule about the PROFILE (how
 * many awards may be pinned to it), not about this screen.
 *
 * Props are (username, isOwn) on purpose: a route knows the username in the
 * URL and whether the viewer is the owner, and nothing else.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import { toast } from "sonner"

import { BackHeader } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useUserProfile } from "@/features/profile/hooks/useProfileQueries"

import { ACHIEVEMENTS_EMPTY_ICON } from "../../achievementMeta"
import {
  useDeleteAchievement,
  useUpdateAchievement,
  useUserAchievements,
} from "../../hooks/useAchievementQueries"
import {
  MAX_ACHIEVEMENTS,
  MAX_PINNED_ACHIEVEMENTS,
  type Achievement,
} from "../../types"
import AchievementCard from "../AchievementCard/AchievementCard"
import AchievementModal from "../AchievementModal/AchievementModal"
import styles from "./AchievementsListPage.module.css"

export interface AchievementsListPageProps {
  /** Whose shelf this is. The page resolves the user id from it. */
  username: string
  /** The caller's read on ownership; the API's `is_owner` overrides it. */
  isOwn: boolean
}

type FormState =
  | { mode: "add" }
  | { mode: "edit"; achievement: Achievement }
  | null

export default function AchievementsListPage({
  username,
  isOwn,
}: AchievementsListPageProps) {
  const { data: profile, isLoading: profileLoading, isError: profileError } =
    useUserProfile(username)

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useUserAchievements(profile?.id ?? null)

  const deleteAchievement = useDeleteAchievement()
  const updateAchievement = useUpdateAchievement()

  const [form, setForm] = useState<FormState>(null)
  const [confirming, setConfirming] = useState<Achievement | null>(null)
  const [pinningId, setPinningId] = useState<string | null>(null)

  const canManage = data?.is_owner ?? isOwn
  const achievements = data?.results ?? []
  const pinnedCount = achievements.filter((a) => a.is_pinned).length
  const atCap = achievements.length >= MAX_ACHIEVEMENTS

  const handleDelete = async (achievement: Achievement) => {
    setConfirming(null)
    try {
      await deleteAchievement.mutateAsync(achievement.id)
    } catch {
      // The hook already surfaced the server's message via sonner.
    }
  }

  /** Pin/unpin is an ordinary PATCH; the cap is checked before the request. */
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
      // Same: the hook has already said what went wrong.
    } finally {
      setPinningId(null)
    }
  }

  const header = (
    <BackHeader
      title="Achievements"
      subtitle={profile?.name ?? `@${username}`}
      fallback={`/profile/${username}`}
    />
  )

  // ── Loading ───────────────────────────────────────────────
  if (profileLoading || isLoading) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.skeleton} aria-hidden="true">
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
          <div className={styles.skeletonCard} />
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────
  if (profileError || isError || !profile) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.errorState}>
          <Icon icon="mdi:cloud-off-outline" width={32} height={32} />
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

  return (
    <div className={styles.page}>
      {header}

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {achievements.length}{" "}
          {achievements.length === 1 ? "achievement" : "achievements"}
        </span>
        {canManage && (
          <button
            className={styles.addBtn}
            onClick={() => setForm({ mode: "add" })}
            type="button"
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
          You&apos;ve reached the {MAX_ACHIEVEMENTS}-achievement limit. Delete one
          to add another.
        </p>
      )}

      {achievements.length === 0 ? (
        <div className={styles.emptyState}>
          <Icon icon={ACHIEVEMENTS_EMPTY_ICON} width={36} height={36} />
          <p className={styles.emptyTitle}>
            {canManage ? "Show what you've won" : "Nothing here yet"}
          </p>
          <p className={styles.emptyText}>
            {canManage
              ? "Add your first achievement — trophies, individual awards, records, milestones and coaching certifications."
              : `${profile.name} hasn't added any achievements yet.`}
          </p>
          {canManage && (
            <button
              className={styles.emptyAddBtn}
              onClick={() => setForm({ mode: "add" })}
              type="button"
            >
              <Icon icon="mdi:plus" width={16} height={16} />
              Add achievement
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {achievements.map((achievement) => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              isOwn={canManage}
              pinning={pinningId === achievement.id}
              onEdit={(target) => setForm({ mode: "edit", achievement: target })}
              onDelete={(target) => setConfirming(target)}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      )}

      {form && canManage && (
        <AchievementModal
          achievement={form.mode === "edit" ? form.achievement : undefined}
          pinnedCount={pinnedCount}
          onClose={() => setForm(null)}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this achievement?"
        message={
          confirming
            ? `${confirming.title} will be removed from your profile. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => confirming && handleDelete(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
