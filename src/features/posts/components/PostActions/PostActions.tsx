"use client"

/**
 * PostActions
 *
 * Like behaviour:
 *   Desktop: hover the like button → emoji popover appears after 400ms
 *            single click → like/unlike with current reaction type
 *   Mobile:  single tap → like/unlike immediately (no popover on tap)
 *            long-press (600ms) → popover for choosing reaction
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { Icon } from "@iconify/react"
import { useToggleLike } from "@/features/posts/hooks/usePostMutations"
import type { Post, ReactionType, FetchPostsParams } from "@/features/posts/services/posts.api"
import styles from "./PostActions.module.css"

// ── Reaction definitions ──────────────────────────────────────
// Each reaction has ONE canonical Iconify icon used everywhere
// (button + popover). No emoji suffix — keep it clean.

const REACTIONS: {
  type:    ReactionType
  icon:    string        // icon shown in the action button when active
  popIcon: string        // icon shown inside the popover picker
  label:   string
  color:   string
}[] = [
  {
    type:    "like",
    icon:    "mdi:lightning-bolt",
    popIcon: "mdi:lightning-bolt",
    label:   "Like",
    color:   "var(--color-brand)",
  },
  {
    type:    "fire",
    icon:    "mdi:fire",
    popIcon: "mdi:fire",
    label:   "Fire",
    color:   "#FF5E00",
  },
  {
    type:    "respect",
    icon:    "fluent:hand-wave-24-filled",
    popIcon: "fluent:hand-wave-24-filled",
    label:   "Respect",
    color:   "#FFC83D",
  },
  {
    type:    "funny",
    icon:    "fluent:emoji-laugh-24-filled",
    popIcon: "fluent:emoji-laugh-24-filled",
    label:   "Funny",
    color:   "#FFC83D",
  },
]

const DEFAULT_REACTION = REACTIONS[0]

// ── Reaction popover ──────────────────────────────────────────

function ReactionPopover({
  visible,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  visible:      boolean
  onSelect:     (type: ReactionType) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  if (!visible) return null
  return (
    <div
      className={styles.popover}
      role="menu"
      aria-label="Choose reaction"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          className={styles.popoverBtn}
          onClick={() => onSelect(r.type)}
          type="button"
          role="menuitem"
          aria-label={r.label}
          title={r.label}
          style={{ "--reaction-color": r.color } as React.CSSProperties}
        >
          <span className={styles.popoverIcon}>
            <Icon icon={r.popIcon} width={26} height={26} color={r.color} />
          </span>
          <span className={styles.popoverLabel}>{r.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── PostActions ───────────────────────────────────────────────

interface PostActionsProps {
  post:           Post
  queryParams:    FetchPostsParams
  onCommentClick: () => void
}

export default function PostActions({
  post,
  queryParams,
  onCommentClick,
}: PostActionsProps) {
  const mutation  = useToggleLike(queryParams)
  const isPending = mutation.isPending

  const [popoverVisible, setPopoverVisible] = useState(false)

  // Timers
  const hoverOpenTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress    = useRef(false)

  // Touch device detection (once on mount)
  const isTouch = useRef(false)
  useEffect(() => {
    isTouch.current = window.matchMedia("(hover: none)").matches
  }, [])

  const clearAllTimers = useCallback(() => {
    if (hoverOpenTimer.current)  clearTimeout(hoverOpenTimer.current)
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current)
    if (longPressTimer.current)  clearTimeout(longPressTimer.current)
  }, [])

  // ── Derived reaction state ────────────────────────────────────
  const isReacted    = post.reaction?.is_reacted ?? false
  const reactionType = post.reaction?.type as ReactionType | undefined
  const activeReact  = REACTIONS.find(r => r.type === reactionType) ?? DEFAULT_REACTION

  // When NOT reacted: show outline lightning bolt in muted colour
  // When reacted:     show the filled reaction icon in its colour
  const likeIcon  = isReacted ? activeReact.icon : "mdi:lightning-bolt-outline"
  const likeLabel = isReacted ? activeReact.label : "Like"
  const likeColor = isReacted ? activeReact.color : undefined

  // ── Core action ───────────────────────────────────────────────
  const triggerReact = useCallback((type: ReactionType) => {
    if (isPending) return
    mutation.mutate({ post_id: post.id, type })
    setPopoverVisible(false)
  }, [isPending, mutation, post.id])

  // ── Desktop hover handlers ────────────────────────────────────
  const onMouseEnterBtn = () => {
    if (isTouch.current) return
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current)
    hoverOpenTimer.current = setTimeout(() => setPopoverVisible(true), 400)
  }

  const onMouseLeaveBtn = () => {
    if (isTouch.current) return
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current)
    hoverCloseTimer.current = setTimeout(() => setPopoverVisible(false), 300)
  }

  const onPopoverMouseEnter = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current)
  }

  const onPopoverMouseLeave = () => {
    hoverCloseTimer.current = setTimeout(() => setPopoverVisible(false), 200)
  }

  // Mobile touch handlers (ONLY for detecting long press)
  const onTouchStart = () => {
    didLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true
      setPopoverVisible(true)
    }, 600)
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    // We intentionally let the browser fire the synthesized onClick event
    // for a tap. We don't triggerReact here to prevent double-firing! 
    // Except if the popover opened, we don't want the click to do anything.
  }

  const onTouchCancel = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  // Desktop click AND mobile tap handler
  const onClickBtn = (e: React.MouseEvent) => {
    if (didLongPress.current) {
       // if we just did a long press, the popover opened. 
       // We ignore this click.
       didLongPress.current = false
       return
    }
    clearAllTimers()
    setPopoverVisible(false)
    triggerReact(isReacted && reactionType ? reactionType : "like")
  }

  // ── Close popover on outside click ───────────────────────────
  useEffect(() => {
    if (!popoverVisible) return
    const handler = () => setPopoverVisible(false)
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [popoverVisible])

  return (
    <div className={styles.actionsBar}>

      {/* ── Like / Reaction button ── */}
      <div className={styles.reactionWrap}>
        <ReactionPopover
          visible={popoverVisible}
          onSelect={triggerReact}
          onMouseEnter={onPopoverMouseEnter}
          onMouseLeave={onPopoverMouseLeave}
        />

        <button
          type="button"
          className={`${styles.actionBtn} ${isReacted ? styles.actionBtnActive : ""}`}
          style={isReacted ? { color: likeColor } as React.CSSProperties : undefined}
          disabled={isPending}
          aria-pressed={isReacted}
          aria-label={isReacted ? `Reacted: ${likeLabel}` : "Like"}
          onMouseEnter={onMouseEnterBtn}
          onMouseLeave={onMouseLeaveBtn}
          onClick={onClickBtn}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
        >
          {/*
            Single icon — filled + coloured when reacted, outline when not.
            No separate emoji badge. Clean and standard.
          */}
          <span
            className={styles.actionIcon}
            style={isReacted ? { color: likeColor } as React.CSSProperties : undefined}
          >
            <Icon icon={likeIcon} width={20} height={20} />
          </span>
          <span className={styles.actionLabel}>{likeLabel}</span>
        </button>
      </div>

      {/* ── Comment ── */}
      <button
        type="button"
        className={styles.actionBtn}
        onClick={onCommentClick}
        aria-label="Comment"
      >
        <span className={styles.actionIcon}>
          <Icon icon="mdi:comment-outline" width={20} height={20} />
        </span>
        <span className={styles.actionLabel}>Comment</span>
      </button>

      {/* ── Share ── */}
      <button
        type="button"
        className={styles.actionBtn}
        aria-label="Share"
      >
        <span className={styles.actionIcon}>
          <Icon icon="mdi:share-outline" width={20} height={20} />
        </span>
        <span className={styles.actionLabel}>Share</span>
      </button>

    </div>
  )
}