"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import CareerAddPromptSheet from "@/features/career/components/CareerAddPromptSheet/CareerAddPromptSheet"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import NotificationBell from "../NotificationBell/NotificationBell"
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
} from "../../hooks/useNotificationQueries"
import type { Notification, NotificationType } from "../../services/notifications.api"
import styles from "./NotificationsList.module.css"

dayjs.extend(relativeTime)

// ── Icon / color maps ─────────────────────────────────────────

const NOTIF_ICON: Record<NotificationType, string> = {
  follow: "mdi:account-plus",
  follow_back: "mdi:account-check",
  like: "mdi:heart",
  comment: "mdi:comment",
  mention: "mdi:at",
  connection: "mdi:account-network",
  recruitment_application: "mdi:account-multiple-plus",
  recruitment_application_status: "mdi:clipboard-check-outline",
  career_verification_request: "mdi:shield-search",
  career_verified: "mdi:check-decagram",
  career_rejected: "mdi:shield-off-outline",
  career_add_prompt: "mdi:timeline-plus-outline",
}

const NOTIF_COLOR: Record<NotificationType, string> = {
  follow: "var(--color-brand)",
  follow_back: "var(--color-brand)",
  like: "#e8462a",
  comment: "#3b82f6",
  mention: "#f59e0b",
  connection: "var(--color-brand)",
  recruitment_application: "var(--color-brand)",
  recruitment_application_status: "#7c3aed",
  career_verification_request: "#f59e0b",
  career_verified: "var(--color-brand)",
  career_rejected: "var(--color-text-muted)",
  career_add_prompt: "#7c3aed",
}

// ── Single notification item ──────────────────────────────────

function NotificationItem({
  notif,
  onAddToCareer,
}: {
  notif: Notification
  onAddToCareer: (notif: Notification) => void
}) {
  const { mutate: markRead } = useMarkNotificationRead()
  const { toRecruitment, toProfile, toCareerVerifications } = useNavigation()
  const myUsername = useAuthStore((s) => s.user?.username)
  const actor = notif.actors[0]

  const handleClick = () => {
    if (!notif.is_read) markRead(notif.id)
  }

  const icon = NOTIF_ICON[notif.type] ?? "mdi:bell"
  const color = NOTIF_COLOR[notif.type] ?? "var(--color-brand)"

  // Org-side "someone applied" (grouped, → admin applicants tab) vs player-side
  // "your status changed" (single, → the player recruitment detail). Both show
  // the recruitment title context line.
  const isApply = notif.type === "recruitment_application"
  const isStatus = notif.type === "recruitment_application_status"

  // Career decisions land on the player's OWN profile, anchored at the career
  // section — the entry that changed lives there, not on the org that decided.
  const isCareerDecision =
    notif.type === "career_verified" || notif.type === "career_rejected"
  const isCareerRequest = notif.type === "career_verification_request"
  const isCareerPrompt = notif.type === "career_add_prompt"

  const isRecruitment = isApply || isStatus || isCareerPrompt

  const careerOwner =
    (notif.data?.owner_username as string | undefined) || myUsername

  const href = isCareerDecision && careerOwner
    ? `${toProfile(careerOwner)}#career`
    : isCareerRequest
      // Only ever arrives while acting as the org, so this resolves inside the
      // admin route space.
      ? toCareerVerifications()
      : isStatus && notif.recruitment
        ? `/recruitments/${notif.recruitment.id}`
        : isApply && notif.recruitment
          // toRecruitment() resolves the /organization/admin/<orgId>/… base path
          // from the active org actor (apply notifications only arrive as the org).
          ? `${toRecruitment(notif.recruitment.id)}?tab=applicants`
          : notif.post
            ? `/posts/${notif.post.id}`
            : actor
              ? `/profile/${actor.username || actor.name.toLowerCase().replace(/\s+/g, "")}`
              : "#"

  // Only grouped applies stack avatars; status changes are single-actor (the org).
  const stackedActors = isApply ? notif.actors.slice(0, 3) : []
  const useStack = isApply && stackedActors.length > 1

  const contextTitle =
    notif.recruitment?.title ??
    (notif.data?.recruitment_title as string | undefined) ??
    notif.career_entry?.title

  const body = (
    <>
      {/* Unread pip */}
      {!notif.is_read && <span className={styles.unreadPip} aria-label="Unread" />}

      {/* Avatar(s) + type badge */}
      <div className={styles.avatarWrap}>
        {useStack ? (
          <div className={styles.stackedAvatars}>
            {stackedActors.map((a, i) => (
              <span
                key={a.id}
                className={styles.stackedAvatar}
                style={{ zIndex: stackedActors.length - i }}
              >
                <Avatar
                  src={a.avatar}
                  initials={a.name?.slice(0, 2).toUpperCase() || "?"}
                  size="sm"
                />
              </span>
            ))}
          </div>
        ) : (
          <Avatar
            src={actor?.avatar}
            initials={actor?.name?.slice(0, 2).toUpperCase() || "?"}
            size="md"
          />
        )}
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

        {isRecruitment || isCareerDecision || isCareerRequest ? (
          contextTitle && (
            <p className={styles.recruitmentContext}>
              <Icon
                icon={
                  isCareerDecision || isCareerRequest
                    ? "mdi:timeline-text-outline"
                    : "mdi:bullhorn-variant-outline"
                }
                width={11}
                height={11}
              />
              {contextTitle}
            </p>
          )
        ) : (
          <>
            {notif.post?.content && (
              <p className={styles.postSnippet}>
                &quot;{notif.post.content.length > 60
                  ? notif.post.content.slice(0, 60) + "…"
                  : notif.post.content}&quot;
              </p>
            )}

            {notif.comment?.text && (
              <p className={styles.commentSnippet}>
                <Icon icon="mdi:comment-outline" width={11} height={11} />
                {notif.comment.text}
              </p>
            )}
          </>
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
                loading="lazy"
                decoding="async"
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
    </>
  )

  // The add-to-career prompt is the one type that is an ACTION rather than a
  // destination — it opens the confirm sheet in place, so it renders as a
  // button instead of a link.
  if (isCareerPrompt) {
    return (
      <button
        type="button"
        className={`${styles.item} ${styles.itemButton} ${!notif.is_read ? styles.itemUnread : ""}`}
        onClick={() => {
          handleClick()
          onAddToCareer(notif)
        }}
      >
        {body}
      </button>
    )
  }

  return (
    <Link
      href={href}
      className={`${styles.item} ${!notif.is_read ? styles.itemUnread : ""}`}
      onClick={handleClick}
    >
      {body}
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonAvatar} />
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
        No notifications yet. When people follow or interact with you, you&apos;ll see it here.
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

  // The `career_add_prompt` row opens this instead of navigating. Held here so
  // the sheet outlives the row's own render.
  const [careerPrompt, setCareerPrompt] = useState<Notification | null>(null)

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
    // Prefetch ~600px early so the next page is ready before the user hits the
    // bottom. Rows are cheap text (only a 60px thumbnail), so content-visibility
    // is deliberately NOT applied here — it only pays off on tall media cards.
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "600px",
      threshold: 0,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const allNotifications = useMemo(
    () => data?.pages.flatMap((p) => p.results) ?? [],
    [data]
  )
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

      {/* ── Sticky header ── */}
      <div className={styles.header}>

        {/* Left group: title + mark-all */}
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Notifications</h1>
        </div>

        {hasUnread && (
          <button
            className={styles.markAllBtn}
            onClick={() => markAllRead()}
            disabled={markingAll}
            type="button"
            aria-label="Mark all notifications as read"
          >
            {markingAll
              ? <Icon icon="mdi:loading" width={13} height={13} className={styles.spinIcon} />
              : <Icon icon="mdi:check-all" width={13} height={13} />
            }
            <span className={styles.markAllLabel}>Mark all read</span>
          </button>
        )}

        {/* Right: push notification toggle */}
        <NotificationBell showLabel />
      </div>

      {/* ── List ── */}
      <div className={styles.list}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <NotificationSkeleton key={i} />)
        ) : allNotifications.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {allNotifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onAddToCareer={setCareerPrompt}
              />
            ))}
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

      {careerPrompt?.data?.application_id && (
        <CareerAddPromptSheet
          applicationId={careerPrompt.data.application_id}
          recruitmentId={
            careerPrompt.recruitment?.id ??
            (careerPrompt.data.recruitment_id as string | undefined)
          }
          organizationName={careerPrompt.actors[0]?.name}
          organizationLogo={careerPrompt.actors[0]?.avatar}
          onClose={() => setCareerPrompt(null)}
        />
      )}
    </div>
  )
}