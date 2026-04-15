"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import isToday from "dayjs/plugin/isToday"
import isYesterday from "dayjs/plugin/isYesterday"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useConversations } from "../../hooks/useConversationQueries"
import { useAuthStore } from "@/store/auth.store"
import type { Conversation, MessageType } from "../../services/conversations.api"
import styles from "./ConversationsList.module.css"

dayjs.extend(relativeTime)
dayjs.extend(isToday)
dayjs.extend(isYesterday)

// ── Helpers ───────────────────────────────────────────────────

type Tab = "active" | "requested"

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = dayjs(dateStr)
  if (d.isToday()) return d.format("h:mm A")
  if (d.isYesterday()) return "Yesterday"
  if (dayjs().diff(d, "day") < 7) return d.format("ddd")
  return d.format("MMM D")
}

function getMessagePreview(
  conv: Conversation,
  myUserId: string | undefined
): string {
  const msg = conv.last_message
  if (!msg) return "Start a conversation"

  const isMe = msg.sender_id === myUserId
  const prefix = isMe ? "You: " : ""

  if (msg.message_type === "image") return `${prefix}📷 Photo`
  if (msg.message_type === "video") return `${prefix}🎥 Video`

  // Text — truncate at 40 chars
  const text = msg.content.length > 40
    ? msg.content.slice(0, 40) + "…"
    : msg.content

  return `${prefix}${text}`
}

function getUnreadLabel(count: number): string {
  if (count <= 0) return ""
  if (count === 1) return "1"
  return count > 9 ? "9+" : String(count)
}

// ── Skeleton row ──────────────────────────────────────────────

function ConversationSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonAvatar} />
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonTop}>
          <div className={styles.skeletonName} />
          <div className={styles.skeletonTime} />
        </div>
        <div className={styles.skeletonPreview} />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon
          icon={tab === "requested" ? "mdi:message-question-outline" : "mdi:message-outline"}
          width={40}
          height={40}
        />
      </span>
      <p className={styles.emptyTitle}>
        {tab === "requested" ? "No message requests" : "No conversations yet"}
      </p>
      <p className={styles.emptySubtitle}>
        {tab === "requested"
          ? "Message requests from people you don't follow will appear here."
          : "When you message someone, the conversation will show up here."}
      </p>
    </div>
  )
}

// ── Single conversation row ────────────────────────────────────

function ConversationRow({
  conv,
  myUserId,
}: {
  conv: Conversation
  myUserId: string | undefined
}) {
  const hasUnread = conv.unread_count > 0
  const preview = getMessagePreview(conv, myUserId)
  const timeStr = formatTime(conv.last_message_at)
  const unreadLabel = getUnreadLabel(conv.unread_count)

  return (
    <Link
      href={`/messages/${conv.id}`}
      className={`${styles.row} ${hasUnread ? styles.rowUnread : ""}`}
    >
      {/* Avatar */}
      <div className={styles.rowAvatar}>
        <Avatar
          src={conv.other_user.profile_photo}
          initials={conv.other_user.name?.slice(0, 2).toUpperCase() || "?"}
          size="md"
        />
        {/* Online indicator placeholder — wire up when you add presence */}
      </div>

      {/* Content */}
      <div className={styles.rowContent}>
        <div className={styles.rowTop}>
          <span className={`${styles.rowName} ${hasUnread ? styles.rowNameUnread : ""}`}>
            {conv.other_user.name}
          </span>
          {timeStr && (
            <span className={`${styles.rowTime} ${hasUnread ? styles.rowTimeUnread : ""}`}>
              {timeStr}
            </span>
          )}
        </div>

        <div className={styles.rowBottom}>
          <span className={`${styles.rowPreview} ${hasUnread ? styles.rowPreviewUnread : ""}`}>
            {preview}
          </span>

          {/* Unread badge */}
          {conv.unread_count > 1 ? (
            <span className={styles.unreadBadge}>{unreadLabel} new</span>
          ) : conv.unread_count === 1 ? (
            <span className={styles.unreadDot} aria-label="1 unread message" />
          ) : null}
        </div>

        {/* Headline */}
        {conv.other_user.headline && (
          <p className={styles.rowHeadline}>{conv.other_user.headline}</p>
        )}
      </div>

      {/* Requested chevron hint */}
      {conv.status === "requested" && (
        <span className={styles.requestedChevron} aria-hidden="true">
          <Icon icon="mdi:chevron-right" width={18} height={18} />
        </span>
      )}
    </Link>
  )
}

// ── Search bar ─────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
  onClear,
}: {
  value: string
  onChange: (v: string) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  return (
    <div className={`${styles.searchWrap} ${focused ? styles.searchFocused : ""}`}>
      <Icon icon="mdi:magnify" width={17} height={17} className={styles.searchIcon} />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search conversations…"
        className={styles.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search conversations"
      />
      {value && (
        <button
          className={styles.searchClear}
          onClick={() => { onClear(); inputRef.current?.focus() }}
          type="button"
          aria-label="Clear search"
        >
          <Icon icon="mdi:close" width={14} height={14} />
        </button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export default function ConversationsList() {
  const [tab, setTab] = useState<Tab>("active")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const user = useAuthStore((s) => s.user)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: conversations, isLoading, isError } = useConversations({
    type: tab,
    search: debouncedSearch || undefined,
  })

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t)
    setSearch("")
    setDebouncedSearch("")
  }, [])

  return (
    <div className={styles.container}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Messages</h1>
          <Link href="/messages/new" className={styles.newBtn} aria-label="New message">
            <Icon icon="mdi:pencil-plus-outline" width={20} height={20} />
          </Link>
        </div>

        {/* Search */}
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={() => { setSearch(""); setDebouncedSearch("") }}
        />

        {/* Tabs */}
        <div className={styles.tabs} role="tablist">
          <button
            role="tab"
            aria-selected={tab === "active"}
            className={`${styles.tab} ${tab === "active" ? styles.tabActive : ""}`}
            onClick={() => handleTabChange("active")}
            type="button"
          >
            Chats
          </button>
          <button
            role="tab"
            aria-selected={tab === "requested"}
            className={`${styles.tab} ${tab === "requested" ? styles.tabActive : ""}`}
            onClick={() => handleTabChange("requested")}
            type="button"
          >
            Requests
            {/* Request count could be wired here */}
          </button>
        </div>
      </div>

      {/* ── List ── */}
      <div className={styles.list} role="tabpanel">
        {isError ? (
          <div className={styles.errorState}>
            <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
            <p>Couldn't load conversations.</p>
          </div>
        ) : isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <ConversationSkeleton key={i} />
          ))
        ) : !conversations || conversations.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          conversations.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              myUserId={user?.id}
            />
          ))
        )}
      </div>
    </div>
  )
}