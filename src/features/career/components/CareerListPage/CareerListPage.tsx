"use client"

/**
 * CareerListPage — one player's WHOLE career history, on its own page.
 *
 * The profile's CareerSection pages in threes, which is right for a profile:
 * the section is one of a dozen on that screen. Past ten entries, paging a
 * section three at a time stops being a section and becomes a list, so it
 * hands over to this.
 *
 * Reuses CareerEntryCard exactly as the section renders it — verification
 * badge, description clamp, owner controls and all. Nothing about an entry is
 * decided here, so the day the org side gets the same page, it renders the
 * same card from the same data.
 *
 * Props are (username, isOwn) on purpose: a route knows the username in the
 * URL and whether the viewer is the owner, and nothing else. The user id the
 * careers endpoint wants is looked up here.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import { BackHeader } from "@/shared/components/ui"
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog/ConfirmDialog"
import { useUserProfile } from "@/features/profile/hooks/useProfileQueries"

import { useDeleteCareerEntry, useUserCareer } from "../../hooks/useCareerQueries"
import { MAX_CAREER_ENTRIES, type CareerEntry } from "../../types"
import CareerEntryCard from "../CareerEntryCard/CareerEntryCard"
import CareerEntryModal from "../CareerEntryModal/CareerEntryModal"
import styles from "./CareerListPage.module.css"

export interface CareerListPageProps {
  /** Whose career this is. The page resolves the user id from it. */
  username: string
  /** The caller's read on ownership; the API's `is_owner` overrides it. */
  isOwn: boolean
}

type FormState = { mode: "add" } | { mode: "edit"; entry: CareerEntry } | null

export default function CareerListPage({ username, isOwn }: CareerListPageProps) {
  const { data: profile, isLoading: profileLoading, isError: profileError } =
    useUserProfile(username)

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useUserCareer(profile?.id ?? null)

  const deleteEntry = useDeleteCareerEntry()
  const [form, setForm] = useState<FormState>(null)
  const [confirming, setConfirming] = useState<CareerEntry | null>(null)

  // The server's word on ownership beats comparing ids: acting as an
  // organization never counts as owning your own history. The prop stands in
  // while the request is still out.
  const canManage = data?.is_owner ?? isOwn
  const entries = data?.results ?? []
  const atCap = entries.length >= MAX_CAREER_ENTRIES

  const handleDelete = async (entry: CareerEntry) => {
    setConfirming(null)
    try {
      await deleteEntry.mutateAsync(entry.id)
    } catch {
      // The hook toasts the server's own message; the row stays put.
    }
  }

  const header = (
    <BackHeader
      title="Career"
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
  // A profile that would not load and a career that would not load are the
  // same dead end for the reader, and the same button fixes both.
  if (profileError || isError || !profile) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.errorState}>
          <Icon icon="mdi:cloud-off-outline" width={32} height={32} />
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

  return (
    <div className={styles.page}>
      {header}

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        {canManage && (
          <button
            className={styles.addBtn}
            onClick={() => setForm({ mode: "add" })}
            type="button"
            disabled={atCap}
            title={
              atCap ? `You've reached the ${MAX_CAREER_ENTRIES}-entry limit` : undefined
            }
          >
            <Icon icon="mdi:plus" width={16} height={16} />
            Add
          </button>
        )}
      </div>

      {canManage && atCap && (
        <p className={styles.capNote}>
          You&apos;ve reached the {MAX_CAREER_ENTRIES}-entry limit. Delete one to
          add another.
        </p>
      )}

      {entries.length === 0 ? (
        <div className={styles.emptyState}>
          <Icon icon="mdi:timeline-plus-outline" width={36} height={36} />
          <p className={styles.emptyTitle}>
            {canManage ? "Showcase your journey" : "Nothing here yet"}
          </p>
          <p className={styles.emptyText}>
            {canManage
              ? "Add your first career entry — clubs, academies, national call-ups and coaching roles."
              : `${profile.name} hasn't added any career history yet.`}
          </p>
          {canManage && (
            <button
              className={styles.emptyAddBtn}
              onClick={() => setForm({ mode: "add" })}
              type="button"
            >
              <Icon icon="mdi:plus" width={16} height={16} />
              Add career entry
            </button>
          )}
        </div>
      ) : (
        <div className={styles.timeline}>
          {entries.map((entry, index) => (
            <CareerEntryCard
              key={entry.id}
              entry={entry}
              isOwn={canManage}
              isLast={index === entries.length - 1}
              onEdit={(target) => setForm({ mode: "edit", entry: target })}
              onDelete={(target) => setConfirming(target)}
            />
          ))}
        </div>
      )}

      {form && canManage && (
        <CareerEntryModal
          entry={form.mode === "edit" ? form.entry : undefined}
          onClose={() => setForm(null)}
        />
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this entry?"
        message={
          confirming
            ? `${confirming.title} at ${confirming.organization_name} will be removed from your career history. This can't be undone.`
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
