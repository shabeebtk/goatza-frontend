"use client"

/**
 * BlockedAccountsList — Settings → Blocked accounts.
 *
 * The ONE screen where a blocked account is shown to the person who blocked
 * it. Same IntersectionObserver paging as SavedPostsList / MentionsList.
 *
 * Unblock asks first. It is not destructive in the delete sense, but it is
 * one-way in a way people misread: unblocking does NOT restore the follows the
 * block removed, and the confirm copy says so rather than letting someone
 * discover it afterwards.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"

import Avatar from "@/shared/components/ui/Avatar/Avatar"
import Button from "@/shared/components/ui/Button/Button"
import { useNavigation } from "@/shared/services/navigation.service"
import { useBlockedList, useUnblock } from "../../hooks/useModerationQueries"
import type { BlockedItem } from "../../services/moderation.api"
import styles from "./BlockedAccountsList.module.css"

const SKELETON_COUNT = 4

export default function BlockedAccountsList() {
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useBlockedList()

  const unblock = useUnblock()
  const [pending, setPending] = useState<BlockedItem | null>(null)

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
      rootMargin: "600px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data]
  )

  const confirmUnblock = () => {
    if (!pending) return
    unblock.mutate({
      target_type: pending.blocked.type,
      target_id: pending.blocked.id,
      username: pending.blocked.username,
    })
    setPending(null)
  }

  if (isLoading) {
    return (
      <ul className={styles.list} aria-busy="true">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <li key={i} className={styles.skeletonRow}>
            <span className={styles.skeletonAvatar} />
            <span className={styles.skeletonText}>
              <span className={styles.skeletonLine} />
              <span className={`${styles.skeletonLine} ${styles.short}`} />
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (isError) {
    return (
      <div className={styles.errorCard}>
        <Icon
          icon="mdi:cloud-off-outline"
          width={22}
          height={22}
          className={styles.errorIcon}
          aria-hidden="true"
        />
        <span className={styles.errorText}>
          Couldn&apos;t load blocked accounts.
        </span>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => refetch()}
        >
          Try again
        </button>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon
          icon="mdi:account-cancel-outline"
          width={28}
          height={28}
          className={styles.emptyIcon}
          aria-hidden="true"
        />
        <p className={styles.emptyTitle}>You haven&apos;t blocked anyone.</p>
        <p className={styles.emptyHint}>
          Blocked accounts can&apos;t follow you, message you, or see your
          posts.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className={styles.list}>
        {rows.map((row) => (
          <BlockedRow key={row.id} row={row} onUnblock={() => setPending(row)} />
        ))}
      </ul>

      <div ref={sentinelRef} aria-hidden="true" />

      {isFetchingNextPage && (
        <div className={styles.loadingMore} aria-live="polite">
          Loading…
        </div>
      )}

      {pending && (
        <ConfirmUnblock
          row={pending}
          busy={unblock.isPending}
          onCancel={() => setPending(null)}
          onConfirm={confirmUnblock}
        />
      )}
    </>
  )
}

// ── Row ──────────────────────────────────────────────────────

function BlockedRow({
  row,
  onUnblock,
}: {
  row: BlockedItem
  onUnblock: () => void
}) {
  const { toProfile } = useNavigation()
  const { blocked } = row

  const label = blocked.name || blocked.username
  const initials = (label || "?").slice(0, 2).toUpperCase()

  return (
    <li className={styles.row}>
      {/* Still a link: you blocked them, so you are allowed to look — the
          profile renders its shell + Unblock state. */}
      <Link
        href={toProfile(blocked.username, blocked.type)}
        className={styles.main}
      >
        <Avatar
          src={blocked.avatar || undefined}
          initials={initials}
          size="md"
          className={styles.avatar}
        />
        <span className={styles.text}>
          <span className={styles.name}>{label}</span>
          <span className={styles.handle}>@{blocked.username}</span>
        </span>
      </Link>

      <Button
        variant="outline"
        size="sm"
        onClick={onUnblock}
        className={styles.unblockBtn}
        aria-label={`Unblock ${label}`}
      >
        Unblock
      </Button>
    </li>
  )
}

// ── Confirm ──────────────────────────────────────────────────

function ConfirmUnblock({
  row,
  busy,
  onCancel,
  onConfirm,
}: {
  row: BlockedItem
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const label = row.blocked.name || row.blocked.username

  // Lock the page behind the sheet, same as every other sheet in the app.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])

  // PORTALLED to document.body. Rendered in place it inherited the settings
  // page's stacking context and slid under the bottom nav.
  return createPortal(
    <div
      className={styles.sheetBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unblock-title"
      onClick={onCancel}
    >
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHandle} aria-hidden="true" />

        <h2 id="unblock-title" className={styles.sheetTitle}>
          Unblock @{row.blocked.username}?
        </h2>
        <p className={styles.sheetBody}>
          {label} will be able to follow you, message you and see your posts
          again. This does not restore anyone you were following before.
        </p>

        {/* Native buttons, not <Button fullWidth>: two fullWidth buttons in a
            flex row each claim 100% and overflow the sheet. These flex to an
            equal share and are allowed to shrink. */}
        <div className={styles.sheetActions}>
          <button
            type="button"
            className={styles.sheetCancelBtn}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.sheetConfirmBtn}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Unblocking…" : "Unblock"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
