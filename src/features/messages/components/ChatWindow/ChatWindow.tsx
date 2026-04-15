"use client"

import React, { useEffect, useRef, useCallback, useState } from "react"
import { Icon } from "@iconify/react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import isToday from "dayjs/plugin/isToday"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useAuthStore } from "@/store/auth.store"
import { useChatSocket } from "../../hooks/useChatSocket"
import type { ChatMessage } from "../../hooks/useChatSocket" // Will keep this import for local types if needed
import {
  useConversationDetail,
  useMessages,
  useMarkRead,
  useAcceptConversation,
} from "../../hooks/useConversationQueries"
import styles from "./ChatWindow.module.css"

dayjs.extend(relativeTime)
dayjs.extend(isToday)

// ── Helpers ───────────────────────────────────────────────────

function formatMsgTime(iso: string): string {
  return dayjs(iso).format("h:mm A")
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

// ── Connection pill ───────────────────────────────────────────

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

// ── Message bubble ────────────────────────────────────────────

interface BubbleProps {
  msg: ChatMessage
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
          ${msg.failed  ? styles.bubbleFailed  : ""}
        `}
      >
        <span className={styles.bubbleText}>{msg.content}</span>

        {showTime && (
          <span className={styles.bubbleTime}>
            {formatMsgTime(msg.created_at)}
            {isMine && (
              <Icon
                icon={
                  msg.pending
                    ? "mdi:clock-outline"
                    : msg.failed
                    ? "mdi:alert-circle-outline"
                    : "mdi:check-all"
                }
                width={11}
                height={11}
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
  const user        = useAuthStore((s) => s.user)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const topSentinel = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const [input, setInput]         = useState("")
  const [autoScroll, setAutoScroll] = useState(true)

  // ── Data ──────────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useConversationDetail(conversationId)
  const {
    data:               historyData,
    isLoading:          historyLoading,
    fetchNextPage:      loadOlder,
    hasNextPage:        hasOlderMessages,
    isFetchingNextPage: loadingOlder,
  } = useMessages(conversationId)

  const { mutate: markRead } = useMarkRead()
  const { mutate: acceptConversation, isPending: isAccepting } = useAcceptConversation()

  // ── WebSocket ─────────────────────────────────────────────
  const { send, status } = useChatSocket(conversationId)

  // ── Merge history → WS state ──────────────────────────────
  const wsMessages = React.useMemo(() => {
    if (!historyData) return []
    return historyData.pages
      .flatMap((p) => p.results)
      .map((m) => ({ 
        id: m.id, 
        content: m.content, 
        sender_id: m.sender_id, 
        created_at: m.created_at,
        pending: (m as any).pending,
        failed: (m as any).failed
      }))
      .reverse()
  }, [historyData])

  // ── Mark read on mount ────────────────────────────────────
  useEffect(() => {
    if (detail?.unread_count && detail.unread_count > 0) {
      markRead(conversationId)
    }
  }, [conversationId, detail?.unread_count]) // eslint-disable-line

  // ── Auto-scroll to bottom on new messages ─────────────────
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [wsMessages.length, autoScroll])

  // ── Track scroll — disable auto-scroll if user scrolls up ─
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setAutoScroll(distFromBottom < 80)
  }, [])

  // ── Load older on top sentinel ────────────────────────────
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

  // ── Auto-grow textarea ────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Reset height then grow
    e.target.style.height = "auto"
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    send(trimmed)
    setInput("")
    setAutoScroll(true)
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
    }
  }, [input, send])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Derived ───────────────────────────────────────────────
  const grouped      = groupByDate(wsMessages)
  const isLoading    = detailLoading || historyLoading
  const otherUser    = detail?.other_user
  const isRequested  = detail?.status === "requested"
  const canMessage   = detail?.can_message ?? true

  return (
    // The outer page wrapper constrains width on desktop, full-screen on mobile
    <div className={styles.page}>
      <div className={styles.window}>

        {/* ── Fixed header ── */}
        <div className={styles.header}>
          <Link href="/messages" className={styles.backBtn} aria-label="Back">
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

        {/* ── Request banner (below header, above messages) ── */}
        {isRequested && otherUser && !detail?.is_accepted && (
          <RequestBanner name={otherUser.name} />
        )}

        {/* ── Scrollable message list ── */}
        <div
          ref={listRef}
          className={styles.messageList}
          onScroll={handleScroll}
        >
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
              <p className={styles.emptyChatText}>
                Say hello to {otherUser?.name ?? "them"}!
              </p>
            </div>
          ) : (
            grouped.map(({ label, msgs }) => (
              <div key={label}>
                <DateDivider label={label} />
                {msgs.map((msg, idx) => {
                  const isMine   = msg.sender_id === user?.id
                  const next     = msgs[idx + 1]
                  // Show time if: last in group, different sender next, or >5 min gap
                  const showTime =
                    !next ||
                    next.sender_id !== msg.sender_id ||
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

        {/* ── Fixed input area ── */}
        <div className={styles.inputArea}>
          {isRequested && !canMessage ? (
            <div className={styles.acceptRow}>
              <p className={styles.cannotReply}>Accept the request to reply.</p>
              <button 
                className={styles.acceptBtn} 
                onClick={() => acceptConversation(conversationId)}
                disabled={isAccepting}
              >
                {isAccepting ? "Accepting..." : "Accept"}
              </button>
            </div>
          ) : (
            <div className={styles.inputRow}>
              <textarea
                ref={inputRef}
                className={styles.input}
                placeholder="Message…"
                value={input}
                onChange={handleInputChange}
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
    </div>
  )
}