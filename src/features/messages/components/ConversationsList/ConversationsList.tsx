"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import isToday from "dayjs/plugin/isToday"
import isYesterday from "dayjs/plugin/isYesterday"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import {
  useConversations,
  useConversationsUnreadSummary,
  useMessageTargetSearch,
} from "../../hooks/useConversationQueries"
import { useConversationsSocket } from "../../hooks/useConversationsSocket"
import { useAuthStore } from "@/store/auth.store"
import type { Conversation, MessageTarget, MessageTargetSource } from "../../services/conversations.api"
import { getMessagePreviewText } from "../../utils/messagePreview"
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

  const isMe = (msg.sender?.id || msg.sender_id) === myUserId
  // Single source of truth for preview copy — shared with the live socket
  // update so text/shared/media lines can't drift between them.
  return getMessagePreviewText(msg, isMe)
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
  basePath,
}: {
  conv: Conversation
  myUserId: string | undefined
  basePath: string
}) {
  const hasUnread = conv.unread_count > 0
  const preview = getMessagePreview(conv, myUserId)
  const timeStr = formatTime(conv.last_message_at)
  const unreadLabel = getUnreadLabel(conv.unread_count)

  return (
    <Link
      href={`${basePath}/chat/${conv.id}`}
      className={`${styles.row} ${hasUnread ? styles.rowUnread : ""}`}
    >
      {/* Avatar */}
      <div className={styles.rowAvatar}>
        <Avatar
          src={conv.other_participant.avatar}
          initials={conv.other_participant.name?.slice(0, 2).toUpperCase() || "?"}
          size="md"
        />
        {/* Online indicator placeholder — wire up when you add presence */}
      </div>

      {/* Content */}
      <div className={styles.rowContent}>
        <div className={styles.rowTop}>
          <span className={`${styles.rowName} ${hasUnread ? styles.rowNameUnread : ""}`}>
            {conv.other_participant.name}
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
        {conv.other_participant.headline && (
          <p className={styles.rowHeadline}>{conv.other_participant.headline}</p>
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

// ── Search result row (start / resume a conversation) ─────────

// Group order + labels reflect the search priority: existing chats first,
// then people you follow, then everyone else.
const SEARCH_GROUP_ORDER: { source: MessageTargetSource; label: string }[] = [
  { source: "conversation", label: "Your chats" },
  { source: "following", label: "Following" },
  { source: "all", label: "Other people" },
]

function SearchResultRow({
  target,
  basePath,
}: {
  target: MessageTarget
  basePath: string
}) {
  // Existing conversation → open it directly; otherwise route through the
  // username resolver, which get-or-creates the conversation (same flow as the
  // profile "Message" button).
  const href = target.conversation_id
    ? `${basePath}/chat/${target.conversation_id}`
    : `${basePath}/${target.username}`

  const displayName = target.name || target.username
  const subtitle = target.headline || `@${target.username}`

  return (
    <Link href={href} className={styles.row}>
      <div className={styles.rowAvatar}>
        <Avatar
          src={target.avatar}
          initials={displayName.slice(0, 2).toUpperCase() || "?"}
          size="md"
        />
      </div>

      <div className={styles.rowContent}>
        <div className={styles.rowTop}>
          <span className={styles.rowName}>{displayName}</span>
          {target.type === "organization" && (
            <span className={styles.orgTag}>Org</span>
          )}
        </div>
        <div className={styles.rowBottom}>
          <span className={styles.rowPreview}>{subtitle}</span>
        </div>
      </div>

      <span className={styles.requestedChevron} aria-hidden="true">
        <Icon icon="mdi:chevron-right" width={18} height={18} />
      </span>
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
        placeholder="Search people, organizations…"
        className={styles.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search people and organizations to message"
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
  const isOrgAdminView = useAuthStore((s) => s.isOrgAdminView)
  const actorId = useAuthStore((s) => s.actorId)
  
  const basePath = isOrgAdminView && actorId ? `/organization/admin/${actorId}/messages` : "/messages"
  const myActorId = isOrgAdminView && actorId ? actorId : user?.id

  const [isMounted, setIsMounted] = useState(false)

  // Listen to realtime notifications to refresh list
  useConversationsSocket()

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Searching switches the panel from the tab list to a global people/org
  // search (existing chats → followings → everyone else).
  const isSearching = debouncedSearch.trim().length > 0

  const { data: conversations, isLoading, isError } = useConversations({
    type: tab,
  })

  const {
    data: searchResults,
    isLoading: searchLoading,
    isError: searchError,
  } = useMessageTargetSearch(debouncedSearch)

  // Unread badge counts per tab — updates on read via cache invalidation.
  const { data: unreadSummary } = useConversationsUnreadSummary()

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t)
    setSearch("")
    setDebouncedSearch("")
  }, [])

  if (!isMounted) return null

  // Group search results by source so the priority order is visible.
  const searchGroups = SEARCH_GROUP_ORDER
    .map(({ source, label }) => ({
      source,
      label,
      items: (searchResults ?? []).filter((r) => r.source === source),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className={styles.container}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Messages</h1>
        </div>

        {/* Search */}
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={() => { setSearch(""); setDebouncedSearch("") }}
        />

        {/* Tabs — hidden while searching (search spans everyone, not one tab) */}
        {!isSearching && (
          <div className={styles.tabs} role="tablist">
            <button
              role="tab"
              aria-selected={tab === "active"}
              className={`${styles.tab} ${tab === "active" ? styles.tabActive : ""}`}
              onClick={() => handleTabChange("active")}
              type="button"
            >
              Chats
              {!!unreadSummary?.chats && (
                <span className={styles.tabBadge}>{getUnreadLabel(unreadSummary.chats)}</span>
              )}
            </button>
            <button
              role="tab"
              aria-selected={tab === "requested"}
              className={`${styles.tab} ${tab === "requested" ? styles.tabActive : ""}`}
              onClick={() => handleTabChange("requested")}
              type="button"
            >
              Requests
              {!!unreadSummary?.requests && (
                <span className={styles.tabBadge}>{getUnreadLabel(unreadSummary.requests)}</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Search results (people + orgs to start a chat with) ── */}
      {isSearching ? (
        <div className={styles.list}>
          {searchError ? (
            <div className={styles.errorState}>
              <Icon icon="mdi:alert-circle-outline" width={32} height={32} />
              <p>Couldn’t search right now.</p>
            </div>
          ) : searchLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))
          ) : searchGroups.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Icon icon="mdi:account-search-outline" width={40} height={40} />
              </span>
              <p className={styles.emptyTitle}>No matches</p>
              <p className={styles.emptySubtitle}>
                No people or organizations found for “{debouncedSearch}”.
              </p>
            </div>
          ) : (
            searchGroups.map((group) => (
              <div key={group.source}>
                <div className={styles.groupLabel}>{group.label}</div>
                {group.items.map((target) => (
                  <SearchResultRow
                    key={`${target.type}-${target.id}`}
                    target={target}
                    basePath={basePath}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── Conversation list ── */
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
                myUserId={myActorId}
                basePath={basePath}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}