"use client"

/**
 * ReactionButton — the like button and its reaction picker.
 *
 * Like behaviour:
 *   Desktop: hover the like button → emoji popover appears after 400ms
 *            single click → like/unlike with current reaction type
 *   Mobile:  single tap → like/unlike immediately (no popover on tap)
 *            long-press (600ms) → popover for choosing reaction
 *
 * Extracted from PostActions so the full-screen viewer's rail (phone) and
 * panel (desktop) share ONE implementation of the timers, the long-press /
 * click de-dupe, the isPending guard and the public-view login wall — those
 * are exactly the parts that drift when copied.
 *
 * `variant` only changes the look; `pickerPlacement` decides where the
 * popover opens so it stays on screen (a rail on the right edge opens it to
 * the left).
 */

import { useState, useRef, useCallback, useEffect } from "react"
import { Icon } from "@iconify/react"
import { useToggleLike } from "@/features/posts/hooks/usePostMutations"
import type { Post, ReactionType, FetchPostsParams } from "@/features/posts/services/posts.api"
import { fmtCount } from "@/features/posts/utils/format"
import { DEFAULT_REACTION, REACTIONS } from "@/features/posts/utils/reactions"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import barStyles from "./PostActions.module.css"
import styles from "./ReactionButton.module.css"

export type ReactionButtonVariant = "bar" | "rail" | "panel"
export type ReactionPickerPlacement = "above" | "left"

// ── Reaction popover ──────────────────────────────────────────

function ReactionPopover({
  visible,
  placement,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  visible:      boolean
  placement:    ReactionPickerPlacement
  onSelect:     (type: ReactionType) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  if (!visible) return null
  return (
    <div
      className={`${styles.popover} ${placement === "left" ? styles.popoverLeft : styles.popoverAbove}`}
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

// ── Per-variant class names ───────────────────────────────────
// "bar" reuses PostActions' own classes so it is pixel-identical to the
// Comment and Share buttons beside it.

const VARIANT_CLASSES: Record<
  ReactionButtonVariant,
  { btn: string; btnActive: string; icon: string; label: string; iconSize: number }
> = {
  bar:   { btn: barStyles.actionBtn, btnActive: barStyles.actionBtnActive, icon: barStyles.actionIcon, label: barStyles.actionLabel, iconSize: 20 },
  rail:  { btn: styles.railBtn,      btnActive: styles.railBtnActive,      icon: styles.railIcon,      label: styles.railLabel,      iconSize: 28 },
  panel: { btn: styles.panelBtn,     btnActive: styles.panelBtnActive,     icon: styles.panelIcon,     label: styles.panelLabel,     iconSize: 24 },
}

// ── ReactionButton ────────────────────────────────────────────

interface ReactionButtonProps {
  post:             Post
  queryParams:      FetchPostsParams
  variant?:         ReactionButtonVariant
  pickerPlacement?: ReactionPickerPlacement
}

export default function ReactionButton({
  post,
  queryParams,
  variant = "bar",
  pickerPlacement = "above",
}: ReactionButtonProps) {
  const mutation  = useToggleLike(queryParams)
  const isPending = mutation.isPending

  // Non-null only on a public profile viewed logged out. Every action below
  // routes through the wall instead of firing an authenticated mutation — the
  // button stays visible on purpose, because a post with no affordances reads
  // as broken and converts nobody.
  const publicView = usePublicProfile()

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
    if (publicView) {
      publicView.openLoginWall("react to posts from")
      setPopoverVisible(false)
      return
    }
    if (isPending) return
    mutation.mutate({ post_id: post.id, type })
    setPopoverVisible(false)
  }, [publicView, isPending, mutation, post.id])

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

  const onTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    // We intentionally let the browser fire the synthesized onClick event
    // for a tap. We don't triggerReact here to prevent double-firing!
    // Except if the popover opened, we don't want the click to do anything.
  }

  const onTouchCancel = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  // Desktop click AND mobile tap handler
  const onClickBtn = () => {
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

  const cls = VARIANT_CLASSES[variant]

  return (
    <div className={styles.wrap}>
      <ReactionPopover
        visible={popoverVisible}
        placement={pickerPlacement}
        onSelect={triggerReact}
        onMouseEnter={onPopoverMouseEnter}
        onMouseLeave={onPopoverMouseLeave}
      />

      <button
        type="button"
        className={`${cls.btn} ${isReacted ? cls.btnActive : ""}`}
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
          className={cls.icon}
          style={isReacted ? { color: likeColor } as React.CSSProperties : undefined}
        >
          <Icon icon={likeIcon} width={cls.iconSize} height={cls.iconSize} />
        </span>
        {/* The rail shows the count under the icon (reels-style); the bar and
            panel name the reaction. */}
        <span className={cls.label}>
          {variant === "rail" ? fmtCount(post.likes_count) : likeLabel}
        </span>
      </button>
    </div>
  )
}
