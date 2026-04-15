"use client"

/**
 * ChatWindow
 *
 * Full conversation view. Combines:
 * - REST history (useMessages / useInfiniteQuery, cursor-paginated upward)
 * - Real-time WS messages (useChatSocket)
 * - Optimistic send with pending state
 * - Mark-as-read on mount
 * - "Load older" trigger at top via IntersectionObserver
 * - Request accept / decline UI for status === "requested"
 *
 * Usage:
 *   <ChatWindow conversationId="019d86fd-..." />
 */

import { useEffect, useRef, useCallback, useState, FormEvent } from "react"
import { Icon } from "@iconify/react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import isToday from "dayjs/plugin/isToday"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useAuthStore } from "@/store/auth.store"
import { useChatSocket, type ChatMessage } from "../../hooks/useChatSocket"
import {
  useConversationDetail,
  useMessages,
  useMarkRead,
} from "../../hooks/useConversationQueries"
import styles from "./ChatWindow.module.css"

dayjs.extend(relativeTime)
dayjs.extend(isToday)

// ── Helpers ───────────────────────────────────────────────────

function formatMsgTime(iso: string): string {
  const d = dayjs(iso)
  return d.isToday() ? d.format("h:mm A") : d.format("MMM D, h:mm A")
}

function groupByDate(messages: ChatMessage[]): { label: string; msgs: ChatMessage[] }[] {
  const groups: Map<string, ChatMessage[]> = new Map()

  for (const msg of messages) {
    const d = dayjs(msg.created_at)
    const label = d.isToday()
      ? "Today"
      : d.isSame(dayjs().subtract(1, "day"), "day")
      ? "Yesterday"
      : d.format("MMMM D, YYYY")

    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(msg)
  }

  return Array.from(groups.entries()).map(([label, msgs]) => ({ label, msgs }))
}

// ── Skeleton ──────────────────────────────────────────────────

function MessageSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      {[70, 45, 85, 55, 60].map((w, i) => (
        <div
          key={i}
          className={`${styles.skeletonBubble} ${i % 2 === 0 ? styles.skeletonLeft : styles.skeletonRight}`}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

// ── Connection status pill ────────────────────────────────────

function ConnectionPill({ status }: { status: string }) {
  if (status === "open") return null
  return (
    <div className={`${styles.connPill} ${status === "connecting" ? styles.connPillConnecting : styles.connPillClosed}`}>
      <span className={styles.connDot} />
      {status === "connecting" ? "Connecting…" : "Reconnecting…"}
    </div>
  )
}

// ── Request banner ────────────────────────────────────────────

function RequestBanner({ name }: { name: string }) {
  return (
    <div className={styles.requestBanner}>
      <Icon icon="mdi:message-question-outline" width={20} height={20} />
      <p>
        <strong>{name}</strong> wants to message you. You can reply once you accept.
      </p>
    </div>
  )
}

// ── Date divider ──────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className={styles.dateDivider}>
      <span className={styles.dateDividerLine} />
      <span className={styles.dateDividerLabel}>{label}</span>
      <span className={styles.dateDividerLine} />
    </div>
  )
}

// ── Single message bubble ─────────────────────────────────────

interface BubbleProps {
  msg:   ChatMessage
  isMine: boolean
  showTime: boolean
}

function MessageBubble({ msg, isMine, showTime }: BubbleProps) {
  return (
    <div className={`${styles.bubbleRow} ${isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs}`}>
      <div
        className={`
          ${styles.bubble}
          ${isMine ? styles.bubbleMine : styles.bubbleTheirs}
          ${msg.pending ? styles.bubblePending : ""}
          ${msg.failed ? styles.bubbleFailed : ""}
        `}
      >
        <span className={styles.bubbleText}>{msg.content}</span>

        {showTime && (
          <span className={styles.bubbleTime}>
            {formatMsgTime(msg.created_at)}
            {isMine && (
              <Icon
                icon={msg.pending ? "mdi:clock-outline" : msg.failed ? "mdi:alert-circle-outline" : "mdi:check-all"}
                width={12}
                height={12}
                className={msg.failed ? styles.failIcon : ""}
              />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main ChatWindow ───────────────────────────────────────────

interface ChatWindowProps {
  conversationId: string
}

export default function ChatWindow({ conversationId }: ChatWindowProps) {
  const user = useAuthStore((s) => s.user)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const topSentinel = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState("")
  const [autoScroll, setAutoScroll] = useState(true)

  // ── Data ──────────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useConversationDetail(conversationId)
  const {
    data:              historyData,
    isLoading:         historyLoading,
    fetchNextPage:     loadOlder,
    hasNextPage:       hasOlderMessages,
    isFetchingNextPage: loadingOlder,
  } = useMessages(conversationId)

  const { mutate: markRead } = useMarkRead()

  // ── WebSocket ─────────────────────────────────────────────
  const { messages: wsMessages, send, status, prependMessages } = useChatSocket(conversationId)

  // ── Merge history → WS state ──────────────────────────────
  useEffect(() => {
    if (!historyData) return
    const allHistorical = historyData.pages
      .flatMap((p) => p.results)
      .map((m) => ({
        id:         m.id,
        content:    m.content,
        sender_id:  m.sender_id,
        created_at: m.created_at,
      }))
      .reverse() // Backend returns newest first. Reverse to get oldest first for chronological display.
    prependMessages(allHistorical)
  }, [historyData]) // eslint-disable-line

  // ── Mark read on mount ────────────────────────────────────
  useEffect(() => {
    if (detail?.unread_count && detail.unread_count > 0) {
      markRead(conversationId)
    }
  }, [conversationId, detail?.unread_count]) // eslint-disable-line

  // ── Auto-scroll to bottom on new messages ─────────────────
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [wsMessages.length, autoScroll])

  // ── Track scroll position — disable auto-scroll if user scrolls up ──
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setAutoScroll(distFromBottom < 80)
  }, [])

  // ── Load older messages when top sentinel enters view ─────
  useEffect(() => {
    const el = topSentinel.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasOlderMessages && !loadingOlder) loadOlder() },
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasOlderMessages, loadingOlder, loadOlder])

  // ── Send handler ──────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    send(trimmed)
    setInput("")
    setAutoScroll(true)
  }, [input, send])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Derived ───────────────────────────────────────────────
  const grouped    = groupByDate(wsMessages)
  const isLoading  = detailLoading || historyLoading
  const otherUser  = detail?.other_user
  const isRequested = detail?.status === "requested"
  const canMessage  = detail?.can_message ?? true

  // ── Render ────────────────────────────────────────────────
  return (
    <div className={styles.window}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <Link href="/messages" className={styles.backBtn} aria-label="Back to messages">
          <Icon icon="mdi:arrow-left" width={20} height={20} />
        </Link>

        {isLoading ? (
          <div className={styles.headerSkeletonInfo}>
            <div className={styles.headerSkeletonAvatar} />
            <div className={styles.headerSkeletonText} />
          </div>
        ) : otherUser ? (
          <Link href={`/profile/${otherUser.username}`} className={styles.headerUser}>
            <Avatar
              src={otherUser.profile_photo}
              initials={otherUser.name?.slice(0, 2).toUpperCase()}
              size="sm"
            />
            <div className={styles.headerInfo}>
              <span className={styles.headerName}>{otherUser.name}</span>
              {otherUser.headline && (
                <span className={styles.headerHeadline}>{otherUser.headline}</span>
              )}
            </div>
          </Link>
        ) : null}

        <div className={styles.headerActions}>
          <ConnectionPill status={status} />
        </div>
      </div>

      {/* ── Request banner ── */}
      {isRequested && otherUser && (
        <RequestBanner name={otherUser.name} />
      )}

      {/* ── Message list ── */}
      <div
        ref={listRef}
        className={styles.messageList}
        onScroll={handleScroll}
      >
        {/* Top sentinel for loading older */}
        <div ref={topSentinel} className={styles.topSentinel} />

        {loadingOlder && (
          <div className={styles.loadingOlder}>
            <span className={styles.loadingSpinner} />
          </div>
        )}

        {isLoading ? (
          <MessageSkeleton />
        ) : wsMessages.length === 0 ? (
          <div className={styles.emptyChat}>
            <div className={styles.emptyChatIcon}>
              <Icon icon="mdi:chat-outline" width={40} height={40} />
            </div>
            <p className={styles.emptyChatText}>Say hello to {otherUser?.name ?? "them"}!</p>
          </div>
        ) : (
          grouped.map(({ label, msgs }) => (
            <div key={label}>
              <DateDivider label={label} />
              {msgs.map((msg, idx) => {
                const isMine   = msg.sender_id === user?.id
                const next     = msgs[idx + 1]
                const showTime = !next || next.sender_id !== msg.sender_id ||
                  dayjs(next.created_at).diff(dayjs(msg.created_at), "minute") > 5
                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isMine={isMine}
                    showTime={showTime}
                  />
                )
              })}
            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className={styles.inputArea}>
        {isRequested && !canMessage ? (
          <p className={styles.cannotReply}>Accept the request to reply.</p>
        ) : (
          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={2000}
              aria-label="Message input"
            />
            <button
              className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ""}`}
              onClick={handleSend}
              disabled={!input.trim() || status !== "open"}
              type="button"
              aria-label="Send message"
            >
              <Icon icon="mdi:send" width={18} height={18} />
            </button>
          </div>
        )}
      </div>

    </div>
  )
}