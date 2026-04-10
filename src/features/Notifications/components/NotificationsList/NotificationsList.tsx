"use client"

import { useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from "../../hooks/useNotificationQueries"
import type { Notification, NotificationType } from "../../services/notifications.api"
import styles from "./NotificationsList.module.css"
import Image from "next/image"

dayjs.extend(relativeTime)

// ── Icon map ─────────────────────────────────────────────────

const NOTIF_ICON: Record<NotificationType, string> = {
  follow: "mdi:account-plus",
  follow_back: "mdi:account-check",
  like: "mdi:heart",
  comment: "mdi:comment",
  mention: "mdi:at",
  connection: "mdi:account-network",
}

const NOTIF_COLOR: Record<NotificationType, string> = {
  follow: "var(--color-brand)",
  follow_back: "var(--color-brand)",
  like: "#e8462a",
  comment: "#3b82f6",
  mention: "#f59e0b",
  connection: "var(--color-brand)",
}

// ── Single notification item ──────────────────────────────────

function NotificationItem({ notif }: { notif: Notification }) {
  const { mutate: markRead } = useMarkNotificationRead()
  const actor = notif.actors[0]

  const handleClick = () => {
    if (!notif.is_read) markRead(notif.id)
  }

  const icon = NOTIF_ICON[notif.type] ?? "mdi:bell"
  const color = NOTIF_COLOR[notif.type] ?? "var(--color-brand)"

  // Build the href based on type
  const href =
    notif.post
      ? `/posts/${notif.post.id}`
      : notif.actors[0]
        ? `/profile/${notif.actors[0].name.toLowerCase().replace(/\s+/g, "")}`
        : "#"

  return (
    <Link
      href={href}
      className={`${styles.item} ${!notif.is_read ? styles.itemUnread : ""}`}
      onClick={handleClick}
    >
      {/* Unread pip */}
      {!notif.is_read && <span className={styles.unreadPip} aria-label="Unread" />}

      {/* Avatar with type icon badge */}
      <div className={styles.avatarWrap}>
        <Avatar
          src={actor?.avatar}
          initials={actor?.name?.slice(0, 2).toUpperCase() || "?"}
          size="md"
        />
        <span
          className={styles.typeIcon}
          style={{ background: color }}
          aria-hidden="true"
        >
          <Icon icon={icon} width={11} height={11} />
        </span>
      </div>

      {/* Content */}
      <div className={styles.content}>
        <p className={styles.text}>{notif.text}</p>

        {/* Post preview snippet */}
        {notif.post?.content && (
          <p className={styles.postSnippet}>
            "{notif.post.content.length > 60
              ? notif.post.content.slice(0, 60) + "…"
              : notif.post.content}"
          </p>
        )}

        {/* Comment preview */}
        {notif.comment?.text && (
          <p className={styles.commentSnippet}>
            <Icon icon="mdi:comment-outline" width={11} height={11} />
            {notif.comment.text}
          </p>
        )}

        <time className={styles.time} dateTime={notif.created_at}>
          {dayjs(notif.created_at).fromNow()}
        </time>
      </div>

      {/* Post thumbnail */}
      {notif.post && notif.post.media && (
        
        <div className={styles.mediaThumbnail} aria-hidden="true">
          {notif.post.media ? (
            <div className={styles.imageWrapper}>
              <img
                src={notif.post.media.type === "video" ? (notif.post.media.thumbnail || notif.post.media.url) : notif.post.media.url}
                alt="post preview"
                width={60}
                height={60}
                className={styles.thumbnailImage}
              />

              {/* 🎥 Video overlay */}
              {notif.post.media.type === "video" && (
                <div className={styles.videoIcon}>
                  <Icon icon="mdi:play-circle" width={18} height={18} />
                </div>
              )}
            </div>
          ) : (
            <Icon icon="mdi:image-outline" width={20} height={20} />
          )}
        </div>
      )}
    </Link>
  )
}

// ── Skeleton loader ───────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={`${styles.skeletonAvatar}`} />
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonLine} />
        <div className={styles.skeletonLineShort} />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon icon="mdi:bell-sleep-outline" width={44} height={44} />
      </span>
      <p className={styles.emptyTitle}>All caught up</p>
      <p className={styles.emptySubtitle}>
        No notifications yet. When people follow or interact with you, you'll see it here.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function NotificationsList() {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications()

  const { mutate: markAllRead, isPending: markingAll } = useMarkAllRead()

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const allNotifications = data?.pages.flatMap((p) => p.results) ?? []
  const hasUnread = allNotifications.some((n) => !n.is_read)

  if (isError) {
    return (
      <div className={styles.errorState}>
        <Icon icon="mdi:alert-circle-outline" width={36} height={36} />
        <p>Failed to load notifications.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Notifications</h1>
        {hasUnread && (
          <button
            className={styles.markAllBtn}
            onClick={() => markAllRead()}
            disabled={markingAll}
            type="button"
          >
            {markingAll ? (
              <Icon icon="mdi:loading" width={14} height={14} className={styles.spinIcon} />
            ) : (
              <Icon icon="mdi:check-all" width={14} height={14} />
            )}
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className={styles.list}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))
        ) : allNotifications.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {allNotifications.map((notif) => (
              <NotificationItem key={notif.id} notif={notif} />
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className={styles.sentinel}>
              {isFetchingNextPage && (
                <>
                  <NotificationSkeleton />
                  <NotificationSkeleton />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}