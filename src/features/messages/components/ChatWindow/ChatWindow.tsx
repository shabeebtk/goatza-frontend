"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useCallback, useState } from "react"
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
  useDeleteMessage,
} from "../../hooks/useConversationQueries"

import MessageActions from "../MessageActions/MessageActions"
import SharedRecruitmentMessage from "../SharedRecruitmentMessage/SharedRecruitmentMessage"
import SharedPostMessage from "../SharedPostMessage/SharedPostMessage"
import ImageMessage from "../ImageMessage/ImageMessage"
import VideoMessage from "../VideoMessage/VideoMessage"
import { getMessagePreviewText } from "../../utils/messagePreview"
import {
  validateChatImages,
  validateChatVideoFile,
  getVideoMeta,
  captureVideoThumbnail,
  formatDuration,
  MAX_CHAT_IMAGES,
  MAX_CHAT_VIDEO_SECONDS,
} from "../../services/chatUpload.service"
import styles from "./ChatWindow.module.css"

dayjs.extend(relativeTime)
dayjs.extend(isToday)

// useLayoutEffect warns during SSR; this component is client-only but Next still
// renders it on the server, so pick the safe variant per environment.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/** Distance from the bottom (px) within which the view is considered "pinned". */
const PIN_THRESHOLD = 80

// A picked-but-unsent attachment. `url` is an object URL for the chip preview
// (the raw file for images, the video file itself for videos).
type StagedMedia =
  | { kind: "image"; file: File; url: string }
  | {
      kind: "video"
      file: File
      url: string
      durationSec: number
      // Measured once at staging time and handed to the send path, so the
      // bubble never waits on a second probe of the same file.
      width: number
      height: number
      /** Captured frame, filled in asynchronously. Also an object URL. */
      poster?: string
    }

/** Free every object URL a staged item owns (the file preview AND its poster). */
function revokeStaged(s: StagedMedia) {
  URL.revokeObjectURL(s.url)
  if (s.kind === "video" && s.poster) URL.revokeObjectURL(s.poster)
}

// ── Helpers ───────────────────────────────────────────────────

function formatMsgTime(iso: string): string {
  return dayjs(iso).format("h:mm A")
}

function groupByDate(messages: ChatMessage[]): { label: string; msgs: ChatMessage[] }[] {
  // Hoisted out of the loop — these were rebuilt per message.
  const today = dayjs()
  const yesterday = today.subtract(1, "day")
  const groups: Map<string, ChatMessage[]> = new Map()
  for (const msg of messages) {
    const d = dayjs(msg.created_at)
    const label = d.isToday()
      ? "Today"
      : d.isSame(yesterday, "day")
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
    <div className={styles.skeletonWrap} aria-hidden="true">
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
// Lives inline in the fixed-height header. Deliberately NOT a sibling banner in
// the window column: mounting/unmounting one on every reconnect flap would
// change the message list's height and shift the scroll position.

function ConnectionPill({ status }: { status: string }) {
  const [visible, setVisible] = useState(false)

  // Debounce — a brief reconnect blip shouldn't flash a pill at the user.
  useEffect(() => {
    if (status === "open") return
    const t = window.setTimeout(() => setVisible(true), 1200)
    return () => {
      window.clearTimeout(t)
      setVisible(false)
    }
  }, [status])

  if (status === "open" || !visible) return null
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
  /** Read by the other participant — paints the ticks blue. Own bubbles only. */
  seen: boolean
  onRetryImage?: (id: string) => void
  onRemoveImage?: (id: string) => void
}

// Memoised at module scope (declaring it inside ChatWindow would remount every
// row on every keystroke).
const MessageBubble = React.memo(function MessageBubble({
  msg,
  isMine,
  showTime,
  seen,
  onRetryImage,
  onRemoveImage,
}: BubbleProps) {
  // Plain closures: the media children aren't memoised, so a stable identity
  // would buy nothing — and hand-memoising here makes the React Compiler bail
  // out of optimising this component entirely.
  const handleRetry = () => onRetryImage?.(msg.id)
  const handleRemove = () => onRemoveImage?.(msg.id)

  // Photo — dedicated bubble with progress/retry states.
  if (msg.message_type === "image") {
    return (
      <ImageMessage
        msg={msg}
        isMine={isMine}
        showTime={showTime}
        seen={seen}
        timeLabel={formatMsgTime(msg.created_at)}
        onRetry={handleRetry}
        onRemove={handleRemove}
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
        seen={seen}
        timeLabel={formatMsgTime(msg.created_at)}
        onRetry={handleRetry}
        onRemove={handleRemove}
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
        seen={seen}
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
        seen={seen}
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
            : getMessagePreviewText(
                { message_type: msg.message_type ?? "text", content: msg.content },
                false
              )}
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
                className={
                  msg.failed
                    ? styles.failIcon
                    : seen && !msg.pending
                    ? styles.seenIcon
                    : ""
                }
              />
            )}
          </span>
        )}
      </div>
    </div>
  )
})

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
  const topSentinel = useRef<HTMLDivElement>(null)
  const listRef     = useRef<HTMLDivElement>(null)
  const contentRef  = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const headerRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput]         = useState("")
  const [isMounted, setIsMounted] = useState(false)
  // Media picked but not yet sent — shown as chips above the input. Either up
  // to 5 images OR a single video (never mixed).
  const [staged, setStaged] = useState<StagedMedia[]>([])

  // ── Scroll controller state ───────────────────────────────
  // `autoScroll` (state) drives the jump-to-latest pill; `autoScrollRef` is the
  // same value readable from observers without re-subscribing them.
  const [autoScroll, setAutoScroll] = useState(true)
  const autoScrollRef   = useRef(true)
  // Mirrors `didAnchorRef` as STATE — the sentinel/ResizeObserver effects must
  // re-run once the list is anchored, and a ref mutation can't do that.
  const [anchored, setAnchored] = useState(false)
  const didAnchorRef    = useRef(false)
  // Suppresses handleScroll while we are the ones moving the list.
  const programmaticRef = useRef(false)
  const guardTimerRef   = useRef(0)
  const settleRafRef    = useRef(0)
  // An older page has been requested and its position restore is still owed.
  const pendingPrependRef = useRef(false)
  const olderInFlightRef  = useRef(false)
  const prependTimerRef   = useRef(0)
  // Distance from the bottom, kept fresh by every scroll AND every commit, so
  // the prepend restore uses where the reader actually is — not where they were
  // when the request went out.
  const distFromBottomRef = useRef(0)
  // Consecutive "load older" attempts that came back with no new page. Stops a
  // failing endpoint from being hammered by the sentinel.
  const olderFailuresRef = useRef(0)
  const prevLastIdRef   = useRef<string | null>(null)
  // Newest message the user has actually been shown (they were pinned for it).
  const lastSeenIdRef   = useRef<string | null>(null)
  // Mirror of `lastId`, readable from the stable scroll handler.
  const lastIdRef       = useRef<string | null>(null)
  // Who sent it — the read acknowledgement skips threads where we spoke last.
  const lastSenderRef   = useRef<string | null>(null)
  const convRef         = useRef(conversationId)
  const [unseen, setUnseen] = useState(0)

  // ── Read acknowledgement state ────────────────────────────
  // Newest message id already reported to the server as read, so re-renders
  // and repeated scroll events don't each fire their own request.
  const readAckRef       = useRef<string | null>(null)
  const markReadTimerRef = useRef(0)
  // Callable from the stable scroll handler without re-subscribing it.
  const maybeMarkReadRef = useRef<() => void>(() => {})

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
  const { mutate: deleteMessage } = useDeleteMessage(conversationId)

  // ── WebSocket ─────────────────────────────────────────────
  const { send, status, otherLastReadAt } = useChatSocket(conversationId)

  // ── Merge history → WS state ──────────────────────────────
  // Mapped objects are cached by source identity: React Query's cache updates
  // keep untouched messages referentially stable, so re-mapping them fresh on
  // every write (an upload ticks progress every 5%) would defeat the memoised
  // bubbles and re-render the whole list.
  const mapCacheRef = useRef(new WeakMap<object, ChatMessage>())
  const wsMessages = React.useMemo(() => {
    if (!historyData) return []
    const cache = mapCacheRef.current
    return historyData.pages
      .flatMap((p) => p.results)
      .map((m) => {
        const hit = cache.get(m)
        if (hit) return hit
        // Optimistic-only fields ride on the cached Message but aren't on its
        // type; read them through a narrow cast rather than `any`.
        const opt = m as typeof m & {
          localPreviewUrl?: string
          uploadProgress?: number
          pending?: boolean
          failed?: boolean
        }
        const mapped: ChatMessage = {
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
          is_read: m.is_read,
          localPreviewUrl: opt.localPreviewUrl,
          uploadProgress: opt.uploadProgress,
          pending: opt.pending,
          failed: opt.failed,
        }
        cache.set(m, mapped)
        return mapped
      })
      .reverse()
  }, [historyData])

  // The header may still be loading its detail while the messages are ready —
  // the list must not be gated on it, or the anchor lands on a skeleton.
  const headerLoading = detailLoading || historyLoading
  const listLoading   = historyLoading
  const myActorId     = isOrgAdminView && actorId ? actorId : user?.id
  const lastId        = wsMessages.length ? wsMessages[wsMessages.length - 1].id : null
  const pageCount     = historyData?.pages.length ?? 0

  // ── Revoke any leftover staged previews on unmount ────────
  const stagedRef = useRef(staged)
  useEffect(() => { stagedRef.current = staged }, [staged])
  useEffect(() => () => {
    stagedRef.current.forEach(revokeStaged)
  }, [])

  // ── Mount ─────────────────────────────────────────────────
  useEffect(() => { setIsMounted(true) }, [])

  // ── Mark read ─────────────────────────────────────────────
  // The OTHER side's ticks turn blue off the back of this request (marking read
  // broadcasts a `conversation_read` receipt over the chat socket), so it has
  // to fire on every arrival while the window is open — not once on mount, the
  // way it used to. Everything routes through one function so the "did we
  // already say this?" check lives in a single place.

  const markReadFnRef = useRef(markRead)
  useEffect(() => { markReadFnRef.current = markRead }, [markRead])

  const maybeMarkRead = useCallback(() => {
    // Only claim "read" when the newest message is genuinely in front of the
    // reader: list pinned to the bottom, tab in the foreground. Scrolled up,
    // the unseen badge owns the state instead — the same rule it already uses.
    if (!didAnchorRef.current || !autoScrollRef.current) return
    if (document.visibilityState === "hidden") return

    const last = lastIdRef.current
    if (!last || readAckRef.current === last) return
    // Nothing to acknowledge when the last word was ours.
    if (lastSenderRef.current === myActorId) return

    readAckRef.current = last
    window.clearTimeout(markReadTimerRef.current)
    // Coalesce a burst of arrivals into a single request.
    markReadTimerRef.current = window.setTimeout(
      () => markReadFnRef.current(conversationId),
      250
    )
  }, [conversationId, myActorId])

  useEffect(() => { maybeMarkReadRef.current = maybeMarkRead }, [maybeMarkRead])
  useEffect(() => () => window.clearTimeout(markReadTimerRef.current), [])

  // A new message landed, or the list just anchored on open.
  useEffect(() => { maybeMarkRead() }, [lastId, anchored, maybeMarkRead])

  // Returning to a backgrounded tab counts as reading whatever is on screen.
  useEffect(() => {
    const onWake = () => maybeMarkReadRef.current()
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)
    return () => {
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("focus", onWake)
    }
  }, [])

  // ── Scroll primitives ─────────────────────────────────────

  /** Snapshot how far the reader is from the bottom, for the prepend restore. */
  const recordDistance = useCallback(() => {
    const el = listRef.current
    if (el) distFromBottomRef.current = el.scrollHeight - el.scrollTop
  }, [])

  /** Stop suppressing handleScroll — also called by any real user gesture. */
  const releaseGuard = useCallback(() => {
    programmaticRef.current = false
    if (guardTimerRef.current) {
      window.clearTimeout(guardTimerRef.current)
      guardTimerRef.current = 0
    }
    if (settleRafRef.current) {
      cancelAnimationFrame(settleRafRef.current)
      settleRafRef.current = 0
    }
  }, [])

  /**
   * Hold the guard until a smooth scroll actually finishes.
   *
   * A fixed timer can't work: a long animation outlives it and its own scroll
   * events then read as "the user scrolled away", switching auto-follow off
   * mid-flight. `scrollend` isn't available on older iOS Safari, so watch the
   * offset settle instead, with a hard timeout as the last resort.
   */
  const releaseWhenSettled = useCallback(() => {
    if (settleRafRef.current) cancelAnimationFrame(settleRafRef.current)
    let last = -1
    let still = 0
    let frames = 0
    const step = () => {
      const el = listRef.current
      if (!el) { releaseGuard(); return }
      const top = el.scrollTop
      const atBottom = el.scrollHeight - top - el.clientHeight < 2
      if (top === last) still++
      else { still = 0; last = top }
      frames++
      // Settled, arrived, or ~2s of frames — whichever comes first.
      if (atBottom || still >= 3 || frames > 120) { releaseGuard(); return }
      settleRafRef.current = requestAnimationFrame(step)
    }
    settleRafRef.current = requestAnimationFrame(step)
  }, [releaseGuard])

  /**
   * Start suppressing handleScroll for a scroll we are about to perform
   * ourselves. Released on the next frame, with a timer backstop because rAF
   * never fires in a backgrounded tab (a stuck guard would stop the list
   * tracking the user entirely).
   */
  const beginProgrammatic = useCallback(() => {
    programmaticRef.current = true
    if (guardTimerRef.current) window.clearTimeout(guardTimerRef.current)
    guardTimerRef.current = window.setTimeout(releaseGuard, 200)
    requestAnimationFrame(releaseGuard)
  }, [releaseGuard])

  /**
   * The single owner of scrollTop. Never `scrollIntoView` — that walks up and
   * scrolls every ancestor, which fights the fixed mobile shell and the
   * visualViewport header offset.
   */
  const pinToBottom = useCallback((smooth = false) => {
    const el = listRef.current
    if (!el) return
    programmaticRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    if (guardTimerRef.current) window.clearTimeout(guardTimerRef.current)
    if (smooth) {
      // Hard backstop in case rAF is throttled (backgrounded tab).
      guardTimerRef.current = window.setTimeout(releaseGuard, 2500)
      releaseWhenSettled()
    } else {
      guardTimerRef.current = window.setTimeout(releaseGuard, 60)
    }
  }, [releaseGuard, releaseWhenSettled])

  // ── Reset when the conversation changes ───────────────────
  // A layout effect declared BEFORE the anchor effect: layout effects always run
  // ahead of passive ones, so a passive reset here would undo the anchor.
  useIsoLayoutEffect(() => {
    if (convRef.current === conversationId) return
    convRef.current = conversationId
    didAnchorRef.current = false
    pendingPrependRef.current = false
    olderInFlightRef.current = false
    olderFailuresRef.current = 0
    window.clearTimeout(prependTimerRef.current)
    prevLastIdRef.current = null
    lastSeenIdRef.current = null
    readAckRef.current = null
    window.clearTimeout(markReadTimerRef.current)
    autoScrollRef.current = true
    setAnchored(false)
    setAutoScroll(true)
    setUnseen(0)
  }, [conversationId])

  // ── Land at the bottom on open — instant, before paint ────
  // Gated on a ref, NOT on a message-count transition: with a warm React Query
  // cache the count is already final on the first commit and never changes,
  // which is exactly why an already-read conversation used to open mid-history.
  useIsoLayoutEffect(() => {
    if (didAnchorRef.current) return
    const el = listRef.current
    if (!el || listLoading) return
    didAnchorRef.current = true
    prevLastIdRef.current = lastId
    lastSeenIdRef.current = lastId
    if (wsMessages.length > 0) {
      beginProgrammatic()
      el.scrollTop = el.scrollHeight
    }
    autoScrollRef.current = true
    setAnchored(true)   // arms the sentinel + settle observers
    // `isMounted` MUST stay in the deps: the first commit renders null, so this
    // effect finds no list element — without it the deps would be unchanged on
    // the commit that finally has DOM and the effect would never run again.
  }, [conversationId, isMounted, listLoading, wsMessages.length, lastId, beginProgrammatic])

  // ── Follow new messages ───────────────────────────────────
  // Keyed on the tail id rather than the count: reconciling an optimistic
  // message (WS echo, media upload) swaps the id and changes the bubble's
  // height while the count stays identical.
  useEffect(() => {
    if (!didAnchorRef.current || !lastId) return
    if (prevLastIdRef.current === lastId) return
    // An older page is landing — leave the tail unconsumed so it's handled on
    // the next pass instead of being silently swallowed.
    if (pendingPrependRef.current) return
    const wasFirstSeen = prevLastIdRef.current === null
    prevLastIdRef.current = lastId

    if (autoScrollRef.current) {
      lastSeenIdRef.current = lastId
      pinToBottom(!wasFirstSeen)
      return
    }
    // Scrolled up: don't move the reader. Derive the badge from the last message
    // they actually saw, so a burst counts as a burst — not as one.
    const seenIdx = lastSeenIdRef.current
      ? wsMessages.findIndex((m) => m.id === lastSeenIdRef.current)
      : -1
    if (seenIdx === -1) return
    setUnseen(
      wsMessages.slice(seenIdx + 1).filter((m) => m.sender_id !== myActorId).length
    )
  }, [lastId, wsMessages, myActorId, pinToBottom])

  // ── Track user intent ─────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    // Recorded even during our own scrolls — the prepend restore needs the
    // reader's latest position, including any scrolling done while the older
    // page was in flight.
    distFromBottomRef.current = el.scrollHeight - el.scrollTop
    if (programmaticRef.current) return
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD
    autoScrollRef.current = next
    setAutoScroll((prev) => (prev === next ? prev : next))
    if (next) {
      lastSeenIdRef.current = lastIdRef.current
      setUnseen(0)
      // Scrolling back down to the newest message is reading it.
      maybeMarkReadRef.current()
    }
  }, [])

  // ── Absorb late layout growth while pinned ────────────────
  // One observer replaces every ad-hoc "re-scroll after X" hack: late icons,
  // reconciled bubbles, unreserved media, composer growth, staged chips and the
  // mobile keyboard all land here. Bounded by autoScrollRef, so a user reading
  // history is never yanked.
  useEffect(() => {
    const list = listRef.current
    const content = contentRef.current
    if (!anchored || !list || !content) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      if (!autoScrollRef.current) return
      if (pendingPrependRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Re-check: the user may have started scrolling in the frame between the
        // resize and this callback.
        if (!autoScrollRef.current || pendingPrependRef.current) return
        pinToBottom(false)
      })
    })
    ro.observe(content)   // content grew
    ro.observe(list)      // viewport shrank
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [anchored, pinToBottom])

  // ── Native Mobile Visual Viewport Header Fix ──────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return
    let raf = 0
    const updateHeader = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (headerRef.current) {
          // Offset the header back down by the amount the layout viewport has been pushed up
          headerRef.current.style.transform = `translateY(${window.visualViewport?.offsetTop || 0}px)`
        }
        // iOS moves only the visual viewport when the keyboard opens, so the
        // ResizeObserver above never fires — re-pin here instead.
        if (autoScrollRef.current && didAnchorRef.current) pinToBottom(false)
      })
    }
    // Update on resize and scroll of visual viewport
    window.visualViewport.addEventListener("resize", updateHeader)
    window.visualViewport.addEventListener("scroll", updateHeader)
    updateHeader() // Initial check

    return () => {
      cancelAnimationFrame(raf)
      window.visualViewport?.removeEventListener("resize", updateHeader)
      window.visualViewport?.removeEventListener("scroll", updateHeader)
    }
  }, [pinToBottom])

  // ── Load older on top sentinel ────────────────────────────
  const handleLoadOlder = useCallback(() => {
    const el = listRef.current
    if (!el) return
    recordDistance()
    pendingPrependRef.current = true
    // Last-resort release: whatever happens to the request, the controller must
    // never stay in "a prepend is owed" state indefinitely.
    window.clearTimeout(prependTimerRef.current)
    prependTimerRef.current = window.setTimeout(() => {
      pendingPrependRef.current = false
    }, 15000)
    loadOlder()
  }, [loadOlder, recordDistance])

  useEffect(() => {
    const el = topSentinel.current
    // `anchored` must be state here — until the list has landed at the bottom
    // the sentinel is sitting in view at scrollTop 0 and would page instantly.
    if (!el || !anchored) return
    // A failing endpoint would otherwise be hammered: every settle re-creates
    // this observer, and a still-intersecting sentinel fires again immediately.
    if (olderFailuresRef.current >= 3) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasOlderMessages && !loadingOlder) handleLoadOlder() },
      { root: listRef.current, rootMargin: "300px 0px 0px 0px", threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [anchored, hasOlderMessages, loadingOlder, handleLoadOlder])

  // Restore the reading position after an older page is prepended.
  // Uses the distance recorded moments ago rather than at request time, so
  // scrolling done while the page was in flight isn't discarded.
  useIsoLayoutEffect(() => {
    const el = listRef.current
    if (!el || !pendingPrependRef.current) return   // guards the initial 0→1 page transition
    pendingPrependRef.current = false
    olderFailuresRef.current = 0
    window.clearTimeout(prependTimerRef.current)
    beginProgrammatic()
    el.scrollTop = el.scrollHeight - distFromBottomRef.current
  }, [pageCount, beginProgrammatic])

  // A fetch that settles without adding a page (error, abort, empty) must not
  // strand `pendingPrependRef` — a stuck flag silently disables auto-follow,
  // the unseen badge and the settle observer for the rest of the session.
  useEffect(() => {
    // Wait for a real true→false transition: `loadingOlder` is still false on any
    // commit between requesting the page and React Query picking it up (a scroll
    // event alone can produce one), and clearing there would drop a live prepend.
    if (loadingOlder) { olderInFlightRef.current = true; return }
    if (!olderInFlightRef.current) return
    olderInFlightRef.current = false
    if (!pendingPrependRef.current) return
    pendingPrependRef.current = false
    window.clearTimeout(prependTimerRef.current)
    olderFailuresRef.current += 1
  }, [loadingOlder, pageCount])

  // Keep the mirrors fresh after every commit. Declared AFTER the restore effect
  // so that effect still reads the pre-commit distance. A layout effect, so the
  // passive effects below (mark-read) always read post-commit values.
  useIsoLayoutEffect(() => {
    lastIdRef.current = lastId
    lastSenderRef.current = wsMessages.length
      ? wsMessages[wsMessages.length - 1].sender_id
      : null
    recordDistance()
  })

  const jumpToLatest = useCallback(() => {
    autoScrollRef.current = true
    setAutoScroll(true)
    setUnseen(0)
    lastSeenIdRef.current = lastIdRef.current
    maybeMarkReadRef.current()
    pinToBottom(true)
  }, [pinToBottom])

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
    // Block over-length videos BEFORE uploading anything. This probe is timed
    // out inside getVideoMeta, so it can't hang the composer.
    let meta = { durationSec: 0, width: 0, height: 0 }
    try {
      meta = await getVideoMeta(file)
    } catch {
      toast.show({ title: "Couldn't read that video.", variant: "error" })
      return
    }
    if (meta.durationSec > MAX_CHAT_VIDEO_SECONDS) {
      toast.show({ title: `Videos must be ${MAX_CHAT_VIDEO_SECONDS}s or shorter.`, variant: "error" })
      return
    }
    const url = URL.createObjectURL(file)
    setStaged([{
      kind: "video",
      file,
      url,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
    }])

    // Poster frame for the chip, best-effort and never blocking: the chip shows
    // a neutral tile until (and unless) this lands.
    const poster = await captureVideoThumbnail(file)
    if (!poster) return
    setStaged((prev) => {
      const target = prev.find((s) => s.kind === "video" && s.url === url)
      if (!target) {
        // Already sent or removed — don't leak the object URL.
        URL.revokeObjectURL(poster)
        return prev
      }
      return prev.map((s) =>
        s.kind === "video" && s.url === url ? { ...s, poster } : s
      )
    })
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
      if (target) revokeStaged(target)
      return prev.filter((s) => s.url !== url)
    })
  }, [])

  // ── Send ──────────────────────────────────────────────────
  const canSendText = status === "open"

  const handleSend = useCallback(() => {
    const trimmed = input.trim()

    // Media takes precedence — the caption rides on the last item.
    if (staged.length > 0) {
      const video = staged.find((s) => s.kind === "video")
      if (video) {
        sendVideo(video.file, trimmed, {
          durationSec: video.durationSec,
          width: video.width,
          height: video.height,
        })
      } else {
        sendImages(staged.map((s) => s.file), trimmed)
      }
      // The upload hook makes its own object URLs; free the staging previews.
      staged.forEach(revokeStaged)
      setStaged([])
      setInput("")
      // Sending always re-pins — set the ref too, state alone won't be visible
      // to the observers until the next render.
      autoScrollRef.current = true
      setAutoScroll(true)
      setUnseen(0)
      if (inputRef.current) inputRef.current.style.height = "auto"
      return
    }

    if (!trimmed) return
    // Don't insert a ghost bubble while the socket is down — the text would be
    // silently dropped and the bubble would hang "pending" forever.
    if (!canSendText) {
      toast.show({ title: "Still connecting — try again in a moment.", variant: "error" })
      return
    }
    send(trimmed)
    setInput("")
    autoScrollRef.current = true
    setAutoScroll(true)
    setUnseen(0)
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
    }
  }, [input, send, staged, sendImages, sendVideo, canSendText, toast])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // ── Derived ───────────────────────────────────────────────

  /**
   * Epoch ms of the other participant's latest read — everything we sent at or
   * before it has been seen.
   *
   * Seeded from the conversation detail so the ticks are already correct on
   * open, then advanced by the socket. Math.max rather than "socket wins": the
   * detail is a cached query and can land stale (a background refetch) behind a
   * receipt that already arrived, which would flick blue ticks back to grey.
   */
  const seenUntil = useMemo(() => {
    const seed = detail?.other_last_read_at
      ? Date.parse(detail.other_last_read_at)
      : 0
    return Math.max(Number.isNaN(seed) ? 0 : seed, otherLastReadAt)
  }, [detail?.other_last_read_at, otherLastReadAt])

  const grouped      = useMemo(() => groupByDate(wsMessages), [wsMessages])
  const otherUser    = detail?.other_participant
  const isRequested  = detail?.status === "requested"
  const canMessage   = detail?.can_message ?? true
  const basePath     = isOrgAdminView && actorId ? `/organization/admin/${actorId}/messages` : "/messages"

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

          {headerLoading ? (
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

          <div className={styles.headerActions}>
            <ConnectionPill status={status} />
          </div>
        </div>

        {/* ── Request banner (below header, above messages) ── */}
        {isRequested && otherUser && !detail?.is_accepted && (
          <RequestBanner name={otherUser.name} />
        )}

        {/* ── Scrollable message list ── */}
        <div className={styles.listWrap}>
          <div
            ref={listRef}
            className={styles.messageList}
            onScroll={handleScroll}
            // Any real gesture releases the programmatic guard immediately, so a
            // user flick during one of our animations is never swallowed.
            onPointerDown={releaseGuard}
            onWheel={releaseGuard}
            onTouchStart={releaseGuard}
            onKeyDown={releaseGuard}
            // Deliberately no role="log": it would make screen readers announce
            // the entire history on the skeleton→content swap and again on every
            // prepended page.
            aria-label="Messages"
            aria-busy={listLoading}
          >
            <div ref={topSentinel} className={styles.topSentinel} />

            <div ref={contentRef} className={styles.listContent}>
              {listLoading ? (
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
                      // Optimistic rows aren't on the server yet — those are
                      // cancelled/removed from their own bubble instead.
                      const isSettled = !msg.pending && !msg.failed
                      // `is_read` is the load-time snapshot; `seenUntil` covers
                      // everything read since. OR, never replace — both only
                      // ever mean "seen", so a stale false can't unset a true.
                      const seen =
                        isMine &&
                        isSettled &&
                        (msg.is_read === true ||
                          Date.parse(msg.created_at) <= seenUntil)
                      return (
                        <MessageActions
                          key={msg.id}
                          isMine={isMine}
                          canDelete={isMine && isSettled}
                          onDelete={() => deleteMessage(msg.id)}
                          copyText={
                            msg.message_type === "text" || !msg.message_type
                              ? msg.content || undefined
                              : undefined
                          }
                        >
                          <MessageBubble
                            msg={msg}
                            isMine={isMine}
                            showTime={showTime}
                            seen={seen}
                            onRetryImage={retryImage}
                            onRemoveImage={removeImage}
                          />
                        </MessageActions>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Overlaid, not a list child — an in-flow spinner would push the
              content down the moment paging starts and jerk the reader. */}
          {loadingOlder && (
            <div className={styles.loadingOlder}>
              <span className={styles.loadingSpinner} />
            </div>
          )}

          {/* ── Jump to latest ── */}
          {!autoScroll && wsMessages.length > 0 && (
            <button
              type="button"
              className={styles.jumpBtn}
              onClick={jumpToLatest}
              aria-label={unseen > 0 ? `${unseen} new messages — jump to latest` : "Jump to latest"}
            >
              <Icon icon="mdi:arrow-down" width={18} height={18} />
              {unseen > 0 && <span className={styles.jumpCount}>{unseen > 99 ? "99+" : unseen}</span>}
            </button>
          )}
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
                          {/* A <video> element paints the browser's own play
                              button and ignores object-fit until metadata
                              loads. Use the captured poster frame instead — an
                              <img>, exactly like a photo chip. */}
                          {s.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.poster} alt="" className={styles.stagedThumb} />
                          ) : (
                            <span className={styles.stagedThumbFallback} />
                          )}
                          <span className={styles.stagedPlay}>
                            <Icon icon="mdi:play" width={16} height={16} />
                          </span>
                          {s.durationSec > 0 && (
                            <span className={styles.stagedDuration}>
                              {formatDuration(s.durationSec)}
                            </span>
                          )}
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
                      : !input.trim() || !canSendText
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
