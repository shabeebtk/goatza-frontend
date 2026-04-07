"use client"

import { useState, useRef } from "react"
import { Icon } from "@iconify/react"
import { useToggleLike } from "@/features/posts/hooks/usePostMutations"
import type { Post, ReactionType } from "@/features/posts/services/posts.api"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import styles from "./PostActions.module.css"

const REACTION_OPTIONS: { type: ReactionType; icon: string; emoji: string; label: string; color: string }[] = [
  { type: "like", icon: "mdi:lightning-bolt", emoji: "⚡", label: "Like", color: "var(--color-brand)" },
  { type: "fire", icon: "mdi:fire", emoji: "🔥", label: "Fire", color: "#FF5E00" },
  { type: "respect", icon: "mdi:hands-clap", emoji: "👏", label: "Respect", color: "#FFC83D" },
  { type: "funny", icon: "mdi:emoticon-happy-outline", emoji: "😂", label: "Funny", color: "#FFC83D" },
]

interface PostActionsProps {
  post: Post
  queryParams: FetchPostsParams
  onCommentClick: () => void
}

export default function PostActions({ post, queryParams, onCommentClick }: PostActionsProps) {
  const mutation = useToggleLike(queryParams)
  const isPending = mutation.isPending
  const [showReactions, setShowReactions] = useState(false)
  const popoverTimeout = useRef<NodeJS.Timeout | null>(null)

  const handleActionClick = (e: React.MouseEvent, type: ReactionType) => {
    e.stopPropagation()
    if (isPending) return
    mutation.mutate({ post_id: post.id, type })
    setShowReactions(false)
  }

  const handleDefaultLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPending) return
    const toggleType = post.reaction.is_reacted && post.reaction.type ? post.reaction.type : "like"
    mutation.mutate({ post_id: post.id, type: toggleType })
  }

  const handleMouseEnter = () => {
    if (popoverTimeout.current) clearTimeout(popoverTimeout.current)
    setShowReactions(true)
  }

  const handleMouseLeave = () => {
    popoverTimeout.current = setTimeout(() => {
      setShowReactions(false)
    }, 300)
  }

  const activeReaction = REACTION_OPTIONS.find(r => r.type === post.reaction.type)
  const ActionIcon = activeReaction && post.reaction.is_reacted ? activeReaction.icon : "mdi:lightning-bolt-outline"
  const actionLabel = activeReaction && post.reaction.is_reacted ? activeReaction.label : "Like"
  const activeColor = activeReaction && post.reaction.is_reacted ? activeReaction.color : ""

  return (
    <div className={styles.actionsBar}>
      <div 
        className={styles.reactionContainer}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {showReactions && (
          <div className={styles.reactionPopover}>
            {REACTION_OPTIONS.map((ro) => (
              <button
                key={ro.type}
                className={styles.reactionOptionBtn}
                onClick={(e) => handleActionClick(e, ro.type)}
                type="button"
                aria-label={`React with ${ro.label}`}
                title={ro.label}
              >
                <span className={styles.emoji}>{ro.emoji}</span>
              </button>
            ))}
          </div>
        )}
        
        <button
          className={`${styles.actionBtn} ${post.reaction.is_reacted ? styles.actionBtnReacted : ""}`}
          onClick={handleDefaultLike}
          disabled={isPending}
          type="button"
          aria-pressed={post.reaction.is_reacted}
          style={{ color: activeColor || undefined }}
        >
          <Icon icon={ActionIcon} width={20} height={20} />
          <span>{actionLabel}</span>
        </button>
      </div>

      <button
        className={styles.actionBtn}
        onClick={onCommentClick}
        type="button"
        aria-label="Comment"
      >
        <Icon icon="mdi:comment-outline" width={20} height={20} />
        <span>Comment</span>
      </button>

      <button
        className={styles.actionBtn}
        type="button"
        aria-label="Share"
      >
        <Icon icon="mdi:share-outline" width={20} height={20} />
        <span>Share</span>
      </button>
    </div>
  )
}
