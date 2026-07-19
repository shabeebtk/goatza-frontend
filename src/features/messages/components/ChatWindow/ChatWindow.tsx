"use client"

import React, { useEffect, useRef, useCallback, useState } from "react"
import { Icon } from "@iconify/react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import isToday from "dayjs/plugin/isToday"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useAuthStore } from "@/store/auth.store"
import { useNavigation } from "@/shared/services/navigation.service"
import { useChatSocket } from "../../hooks/useChatSocket"
import type { ChatMessage } from "../../hooks/useChatSocket" // Will keep this import for local types if needed
import { useChatMediaUpload } from "../../hooks/useChatImageUpload"
import {
  useConversationDetail,
  useMessages,
  useMarkRead,
  useAcceptConversation,
} from "../../hooks/useConversationQueries"
import SharedRecruitmentMessage from "../SharedRecruitmentMessage/SharedRecruitmentMessage"
import SharedPostMessage from "../SharedPostMessage/SharedPostMessage"
import ImageMessage from "../ImageMessage/ImageMessage"
import VideoMessage from "../VideoMessage/VideoMessage"
import { getMessagePreviewText } from "../../utils/messagePreview"
import {
  validateChatImages,
  validateChatVideoFile,
  getVideoMeta,
  formatDuration,
  MAX_CHAT_IMAGES,
  MAX_CHAT_VIDEO_SECONDS,
} from "../../services/chatUpload.service"
import styles from "./ChatWindow.module.css"

dayjs.extend(relativeTime)
dayjs.extend(isToday)

// A picked-but-unsent attachment. `url` is an object URL for the chip preview
// (the raw file for images, the video file itself for videos).
type StagedMedia =
  | { kind: "image"; file: File; url: string }
  | { kind: "video"; file: File; url: string; durationSec: number }

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
  onRetryImage?: (id: string) => void
  onRemoveImage?: (id: string) => void
}

function MessageBubble({ msg, isMine, showTime, onRetryImage, onRemoveImage }: BubbleProps) {
  // Photo — dedicated bubble with progress/retry states.
  if (msg.message_type === "image") {
    return (
      <ImageMessage
        msg={msg}
        isMine={isMine}
        showTime={showTime}
        timeLabel={formatMsgTime(msg.created_at)}
        onRetry={() => onRetryImage?.(msg.id)}
        onRemove={() => onRemoveImage?.(msg.id)}
      />
    )
  }

  // Video — poster + play button, progress/retry states.
  if (msg.message_type === "video") {
    return (
      <VideoMessage
        msg={msg}
        isMine={isMine}
        showTime={showTime}
        timeLabel={formatMsgTime(msg.created_at)}
        onRetry={() => onRetryImage?.(msg.id)}
        onRemove={() => onRemoveImage?.(msg.id)}
      />
    )
  }

  // Shared content renders a dedicated card (its own aligned row), not a text
  // bubble. Empty content is expected here (caption is optional).
  if (msg.message_type === "shared_recruitment") {
    return (
      <SharedRecruitmentMessage
        preview={msg.shared_recruitment_preview}
        caption={msg.content}
        isMine={isMine}
        showTime={showTime}
        timeLabel={formatMsgTime(msg.created_at)}
        pending={msg.pending}
        failed={msg.failed}
      />
    )
  }

  if (msg.message_type === "shared_post") {
    return (
      <SharedPostMessage
        preview={msg.shared_post_preview}
        caption={msg.content}
        isMine={isMine}
        showTime={showTime}
        timeLabel={formatMsgTime(msg.created_at)}
        pending={msg.pending}
        failed={msg.failed}
      />
    )
  }

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
        <span className={styles.bubbleText}>
          {msg.content
            ? msg.content
            : msg.message_type && msg.message_type !== "text"
            ? getMessagePreviewText(
                { message_type: msg.message_type, content: msg.content },
                false
              )
            : msg.content}
        </span>

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
  const isOrgAdminView = useAuthStore((s) => s.isOrgAdminView)
  const actorId     = useAuthStore((s) => s.actorId)
  const { toProfile } = useNavigation()
  
  const toast = useToast()
  const bottomRef   = useRef<HTMLDivElement>(null)
  const topSentinel = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const headerRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput]         = useState("")
  const [autoScroll, setAutoScroll] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  // Media picked but not yet sent — shown as chips above the input. Either up
  // to 5 images OR a single video (never mixed).
  const [staged, setStaged] = useState<StagedMedia[]>([])

  const { sendImages, sendVideo, retry: retryImage, remove: removeImage } = useChatMediaUpload(conversationId)

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
      .map((m) => {
        // Optimistic-only fields ride on the cached Message but aren't on its
        // type; read them through a narrow cast rather than `any`.
        const opt = m as typeof m & {
          localPreviewUrl?: string
          uploadProgress?: number
          pending?: boolean
          failed?: boolean
        }
        return {
          id: m.id,
          content: m.content,
          sender_id: m.sender?.id || m.sender_id,
          created_at: m.created_at,
          message_type: m.message_type,
          shared_recruitment_preview: m.shared_recruitment_preview,
          shared_post_preview: m.shared_post_preview,
          media_url: m.media_url,
          media_thumbnail_url: m.media_thumbnail_url,
          media_width: m.media_width,
          media_height: m.media_height,
          media_duration_ms: m.media_duration_ms,
          localPreviewUrl: opt.localPreviewUrl,
          uploadProgress: opt.uploadProgress,
          pending: opt.pending,
          failed: opt.failed,
        }
      })
      .reverse()
  }, [historyData])

  // ── Revoke any leftover staged previews on unmount ────────
  const stagedRef = useRef(staged)
  useEffect(() => { stagedRef.current = staged }, [staged])
  useEffect(() => () => {
    stagedRef.current.forEach((s) => URL.revokeObjectURL(s.url))
  }, [])

  // ── Mark read on mount ────────────────────────────────────
  useEffect(() => {
    setIsMounted(true)
    if (detail?.unread_count && detail.unread_count > 0) {
      markRead(conversationId)
    }
  }, [conversationId, detail?.unread_count]) // eslint-disable-line

  // ── Auto-scroll to bottom on new messages ─────────────────
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [wsMessages.length, autoScroll])

  // ── Native Mobile Visual Viewport Header Fix ──────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return
    const updateHeader = () => {
      if (headerRef.current) {
        // Offset the header back down by the amount the layout viewport has been pushed up
        headerRef.current.style.transform = `translateY(${window.visualViewport?.offsetTop || 0}px)`
      }
    }
    // Update on resize and scroll of visual viewport
    window.visualViewport.addEventListener("resize", updateHeader)
    window.visualViewport.addEventListener("scroll", updateHeader)
    updateHeader() // Initial check
    
    return () => {
      window.visualViewport?.removeEventListener("resize", updateHeader)
      window.visualViewport?.removeEventListener("scroll", updateHeader)
    }
  }, [])

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

  // ── Media picking ─────────────────────────────────────────
  const stageImages = useCallback((files: File[]) => {
    if (staged.some((s) => s.kind === "video")) {
      toast.show({ title: "Can't mix photos and a video.", variant: "error" })
      return
    }
    const err = validateChatImages(files)
    if (err) {
      toast.show({ title: err, variant: "error" })
      return
    }
    const room = MAX_CHAT_IMAGES - staged.length
    if (room <= 0) {
      toast.show({ title: `You can send up to ${MAX_CHAT_IMAGES} photos.`, variant: "error" })
      return
    }
    if (files.length > room) {
      toast.show({ title: `Only ${MAX_CHAT_IMAGES} photos at a time.`, variant: "error" })
    }
    const next: StagedMedia[] = files.slice(0, room).map((file) => ({
      kind: "image" as const,
      file,
      url: URL.createObjectURL(file),
    }))
    setStaged((prev) => [...prev, ...next])
  }, [staged, toast])

  const stageVideo = useCallback(async (file: File) => {
    if (staged.length > 0) {
      toast.show({ title: "Send the video on its own.", variant: "error" })
      return
    }
    const err = validateChatVideoFile(file)
    if (err) {
      toast.show({ title: err, variant: "error" })
      return
    }
    // Block over-length videos BEFORE uploading anything.
    let durationSec = 0
    try {
      durationSec = (await getVideoMeta(file)).durationSec
    } catch {
      toast.show({ title: "Couldn't read that video.", variant: "error" })
      return
    }
    if (durationSec > MAX_CHAT_VIDEO_SECONDS) {
      toast.show({ title: `Videos must be ${MAX_CHAT_VIDEO_SECONDS}s or shorter.`, variant: "error" })
      return
    }
    setStaged([{ kind: "video", file, url: URL.createObjectURL(file), durationSec }])
  }, [staged.length, toast])

  const handlePickMedia = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""   // allow re-picking the same file
    if (files.length === 0) return

    const videos = files.filter((f) => f.type.startsWith("video/"))
    const images = files.filter((f) => f.type.startsWith("image/"))

    if (videos.length > 0 && images.length > 0) {
      toast.show({ title: "Can't mix photos and a video.", variant: "error" })
      return
    }
    if (videos.length > 1) {
      toast.show({ title: "One video at a time.", variant: "error" })
      return
    }
    if (videos.length === 1) {
      void stageVideo(videos[0])
      return
    }
    stageImages(images)
  }, [stageImages, stageVideo, toast])

  const removeStaged = useCallback((url: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.url === url)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((s) => s.url !== url)
    })
  }, [])

  // ── Send ──────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim()

    // Media takes precedence — the caption rides on the last item.
    if (staged.length > 0) {
      const video = staged.find((s) => s.kind === "video")
      if (video) {
        sendVideo(video.file, trimmed)
      } else {
        sendImages(staged.map((s) => s.file), trimmed)
      }
      // The upload hook makes its own object URLs; free the staging previews.
      staged.forEach((s) => URL.revokeObjectURL(s.url))
      setStaged([])
      setInput("")
      setAutoScroll(true)
      if (inputRef.current) inputRef.current.style.height = "auto"
      return
    }

    if (!trimmed) return
    send(trimmed)
    setInput("")
    setAutoScroll(true)
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
    }
  }, [input, send, staged, sendImages, sendVideo])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Derived ───────────────────────────────────────────────
  const grouped      = groupByDate(wsMessages)
  const isLoading    = detailLoading || historyLoading
  const otherUser    = detail?.other_participant
  const isRequested  = detail?.status === "requested"
  const canMessage   = detail?.can_message ?? true
  const basePath     = isOrgAdminView && actorId ? `/organization/admin/${actorId}/messages` : "/messages"
  const myActorId    = isOrgAdminView && actorId ? actorId : user?.id

  if (!isMounted) return null

  return (
    // The outer page wrapper constrains width on desktop, full-screen on mobile
    <div className={styles.page}>
      <div className={styles.window}>

        {/* ── Fixed header ── */}
        <div ref={headerRef} className={styles.header}>
          <Link href={basePath} className={styles.backBtn} aria-label="Back">
            <Icon icon="mdi:arrow-left" width={20} height={20} />
          </Link>

          {isLoading ? (
            <div className={styles.headerSkeletonInfo}>
              <div className={styles.headerSkeletonAvatar} />
              <div className={styles.headerSkeletonText} />
            </div>
          ) : otherUser ? (
            <Link href={toProfile(otherUser.username, otherUser.type)} className={styles.headerUser}>
              <Avatar
                src={otherUser.avatar}
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
{/* 
          <div className={styles.headerActions}>
            <ConnectionPill status={status} />
          </div> */}
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
                  const isMine   = msg.sender_id === myActorId
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
                      onRetryImage={retryImage}
                      onRemoveImage={removeImage}
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
            <div className={styles.composer}>
              {/* Staged media chips (picked, not yet sent) */}
              {staged.length > 0 && (
                <div className={styles.stagedRow}>
                  {staged.map((s) => (
                    <div key={s.url} className={styles.stagedChip}>
                      {s.kind === "video" ? (
                        <>
                          <video src={s.url} className={styles.stagedThumb} muted preload="metadata" />
                          <span className={styles.stagedPlay}>
                            <Icon icon="mdi:play" width={16} height={16} />
                          </span>
                          <span className={styles.stagedDuration}>
                            {formatDuration(s.durationSec)}
                          </span>
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.url} alt="" className={styles.stagedThumb} />
                      )}
                      <button
                        type="button"
                        className={styles.stagedRemove}
                        onClick={() => removeStaged(s.url)}
                        aria-label="Remove attachment"
                      >
                        <Icon icon="mdi:close" width={13} height={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.inputRow}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handlePickMedia}
                  hidden
                />
                <button
                  type="button"
                  className={styles.attachBtn}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add photos or a video"
                >
                  <Icon icon="mdi:image-outline" width={22} height={22} />
                </button>

                <textarea
                  ref={inputRef}
                  className={styles.input}
                  placeholder={staged.length > 0 ? "Add a caption…" : "Message…"}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  maxLength={2000}
                  aria-label="Message input"
                />
                <button
                  className={`${styles.sendBtn} ${(input.trim() || staged.length > 0) ? styles.sendBtnActive : ""}`}
                  onClick={handleSend}
                  disabled={
                    staged.length > 0
                      ? false                       // media goes over REST — no WS needed
                      : !input.trim() || status !== "open"
                  }
                  type="button"
                  aria-label="Send message"
                >
                  <Icon icon="mdi:send" width={18} height={18} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}