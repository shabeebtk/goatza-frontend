"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import MediaCarousel from "@/features/posts/components/MediaCarousel/MediaCarousel"
import PostActions from "@/features/posts/components/PostActions/PostActions"
import PostComments from "@/features/posts/components/PostComments/PostComments"
import type { Post } from "@/features/posts/services/posts.api"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import styles from "./PostCard.module.css"

dayjs.extend(relativeTime)

// ── Helpers ───────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// ── Reaction icon map (matches PostActions) ───────────────────

const REACTION_META: Record<string, { icon: string; color: string }> = {
  like:    { icon: "mdi:lightning-bolt",          color: "var(--color-brand)" },
  fire:    { icon: "mdi:fire",                    color: "#FF5E00"            },
  respect: { icon: "fluent:hand-wave-24-filled",  color: "#FFC83D"            },
  funny:   { icon: "fluent:emoji-laugh-24-filled", color: "#FFC83D"           },
}

// Returns up to 3 reaction types that have count > 0, sorted by count desc
function getTopReactions(
  breakdown: Record<string, number> | undefined
): { type: string; icon: string; color: string }[] {
  if (!breakdown) return []
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type]) => ({
      type,
      ...(REACTION_META[type] ?? { icon: "mdi:lightning-bolt", color: "var(--color-brand)" }),
    }))
}

// ── Content with "see more" ───────────────────────────────────

const CONTENT_LIMIT = 220 // characters before truncation

function PostContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  // Trim to nearest word boundary so we don't cut mid-word
  const isLong = text.length > CONTENT_LIMIT
  const trimmed = isLong
    ? text.slice(0, CONTENT_LIMIT).replace(/\s+\S*$/, "")
    : text
  const display = isLong && !expanded ? trimmed + "…" : text

  return (
    <div className={styles.content}>
      <p className={styles.contentText}>{display}</p>
      {isLong && (
        <button
          className={styles.seeMoreBtn}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          {expanded ? "see less" : "see more"}
        </button>
      )}
    </div>
  )
}

// ── Post card ─────────────────────────────────────────────────

interface PostCardProps {
  post:        Post
  queryParams: FetchPostsParams
}

export default function PostCard({ post, queryParams }: PostCardProps) {
  const [showComments, setShowComments] = useState(false)

  const timeAgo      = dayjs(post.created_at).fromNow()
  const topReactions = getTopReactions(post.likes_breakdown)

  return (
    <article className={styles.card}>

      {/* ── Header: avatar + name + time ── */}
      <div className={styles.cardHeader}>
        <Link href={`/profile/${post.author.username}`} className={styles.authorLink}>
          <Avatar
            src={post.author.profile_photo}
            initials={post.author.name?.slice(0, 2).toUpperCase()}
            size="md"
          />
          <div className={styles.authorInfo}>
            <span className={styles.authorName}>{post.author.name}</span>
            {post.author.headline && (
              <span className={styles.authorHeadline}>{post.author.headline}</span>
            )}
            <span className={styles.postMeta}>
              <span className={styles.timeAgo}>{timeAgo}</span>
              {post.visibility === "followers" && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <Icon icon="mdi:account-group-outline" width={12} height={12} />
                </>
              )}
              {post.sport && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <Icon icon={post.sport.icon_name} width={12} height={12} />
                  <span>{post.sport.name}</span>
                </>
              )}
            </span>
          </div>
        </Link>

        <button className={styles.moreBtn} type="button" aria-label="More options">
          <Icon icon="mdi:dots-horizontal" width={20} height={20} />
        </button>
      </div>

      {/* ── Content ── */}
      <PostContent text={post.content} />

      {/* ── Media ── */}
      {post.media.length > 0 && (
        <div className={styles.mediaWrap}>
          <MediaCarousel media={post.media} postId={post.id} />
        </div>
      )}

      {/* ── Stats row ── */}
      {(post.likes_count > 0 || post.comments_count > 0) && (
        <div className={styles.statsRow}>

          {/* Reaction icons cluster + total count */}
          {post.likes_count > 0 && (
            <span className={styles.statItem}>
              {/* Stack up to 3 reaction icons */}
              <span className={styles.reactionIcons}>
                {topReactions.length > 0
                  ? topReactions.map((r) => (
                      <span
                        key={r.type}
                        className={styles.reactionIconBubble}
                        title={r.type}
                      >
                        <Icon icon={r.icon} width={13} height={13} color={r.color} />
                      </span>
                    ))
                  : /* fallback if breakdown missing */
                    <span className={styles.reactionIconBubble}>
                      <Icon icon="mdi:lightning-bolt" width={11} height={11} color="var(--color-brand)" />
                    </span>
                }
              </span>
              <span className={styles.statCount}>{fmtCount(post.likes_count)}</span>
            </span>
          )}

          {/* Comment count */}
          {post.comments_count > 0 && (
            <button
              className={`${styles.statItem} ${styles.statItemBtn}`}
              onClick={() => setShowComments(!showComments)}
            >
              {fmtCount(post.comments_count)} comment{post.comments_count !== 1 ? "s" : ""}
            </button>
          )}

        </div>
      )}

      {/* ── Actions ── */}
      <PostActions
        post={post}
        queryParams={queryParams}
        onCommentClick={() => setShowComments(!showComments)}
      />

      {/* ── Comments ── */}
      {showComments && (
        <PostComments postId={post.id} />
      )}

    </article>
  )
}