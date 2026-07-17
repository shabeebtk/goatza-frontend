"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import { usePostLikes } from "@/features/posts/hooks/usePostLikes"
import type { PostLike, ReactionType } from "@/features/posts/services/posts.api"
import styles from "./PostLikesModal.module.css"

// Reaction icon + colour, keyed by type (mirrors PostCard / PostActions).
const REACTION_META: Record<ReactionType, { icon: string; color: string; label: string }> = {
  like: { icon: "mdi:lightning-bolt", color: "var(--color-brand)", label: "Like" },
  fire: { icon: "mdi:fire", color: "#FF5E00", label: "Fire" },
  respect: { icon: "fluent:hand-wave-24-filled", color: "#FFC83D", label: "Respect" },
  funny: { icon: "fluent:emoji-laugh-24-filled", color: "#FFC83D", label: "Funny" },
}

const SKELETON_COUNT = 8

interface PostLikesModalProps {
  postId: string
  /** Total likes count (from the post) — shown in the header until the list loads. */
  totalCount: number
  onClose: () => void
}

// ── Single reactor row ───────────────────────────────────────
function LikeRow({ like, onNavigate }: { like: PostLike; onNavigate: () => void }) {
  const { toProfile } = useNavigation()
  const { actor, actor_type } = like
  const isOrg = actor_type === "organization"
  const avatar = actor.profile_photo || actor.logo || undefined
  const initials = (actor.name || actor.username || "?").slice(0, 2).toUpperCase()
  const meta = REACTION_META[like.type] ?? REACTION_META.like

  return (
    <li className={styles.row}>
      <Link
        href={toProfile(actor.username, actor_type)}
        className={styles.main}
        onClick={onNavigate}
      >
        <Avatar src={avatar} initials={initials} size="md" className={styles.avatar} />
        <span className={styles.text}>
          <span className={styles.nameLine}>
            <span className={styles.name}>{actor.name || actor.username}</span>
            {isOrg && actor.is_verified && (
              <Icon
                icon="mdi:check-decagram"
                width={15}
                height={15}
                className={styles.verified}
                aria-label="Verified organization"
              />
            )}
          </span>
          {actor.headline && <span className={styles.headline}>{actor.headline}</span>}
        </span>
      </Link>

      <span className={styles.reaction} title={meta.label} aria-label={meta.label}>
        <Icon icon={meta.icon} width={22} height={22} color={meta.color} />
      </span>
    </li>
  )
}

export default function PostLikesModal({ postId, totalCount, onClose }: PostLikesModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePostLikes(postId, true)

  const rows = useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])
  const count = data?.pages[0]?.count ?? totalCount

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Infinite scroll
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
    const observer = new IntersectionObserver(handleObserver, { rootMargin: "400px", threshold: 0 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver, rows.length])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Reactions"
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />

        {/* ── Header ── */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            Reactions
            {count > 0 && <span className={styles.count}>{count}</span>}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          {/* First load */}
          {isLoading && (
            <ul className={styles.list}>
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <li key={i} className={styles.skeletonRow} aria-hidden="true">
                  <span className={styles.skelAvatar} />
                  <span className={styles.skelText}>
                    <span className={styles.skelLine} />
                    <span className={styles.skelLineSm} />
                  </span>
                  <span className={styles.skelReaction} />
                </li>
              ))}
            </ul>
          )}

          {/* Error */}
          {!isLoading && isError && (
            <div className={styles.stateBox} role="alert">
              <Icon icon="mdi:alert-circle-outline" width={40} height={40} />
              <p className={styles.stateTitle}>Couldn&apos;t load reactions</p>
              <button type="button" className={styles.retryBtn} onClick={() => refetch()}>
                <Icon icon="mdi:refresh" width={16} height={16} />
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && rows.length === 0 && (
            <div className={styles.stateBox}>
              <div className={styles.stateIcon}>
                <Icon icon="mdi:lightning-bolt-outline" width={40} height={40} />
              </div>
              <p className={styles.stateTitle}>No reactions yet</p>
            </div>
          )}

          {/* Results */}
          {!isLoading && !isError && rows.length > 0 && (
            <ul className={styles.list}>
              {rows.map((like) => (
                <LikeRow key={`${like.actor_type}-${like.actor.id}`} like={like} onNavigate={onClose} />
              ))}
            </ul>
          )}

          {/* Infinite-scroll sentinel + spinner */}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          {isFetchingNextPage && (
            <div className={styles.loadingMore}>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Loading more…</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
