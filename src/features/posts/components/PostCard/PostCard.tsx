"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import MediaCarousel from "@/features/posts/components/MediaCarousel/MediaCarousel"
import type { Post } from "@/features/posts/services/posts.api"
import type { FetchPostsParams } from "@/features/posts/services/posts.api"
import { useLikePost } from "@/features/posts/hooks/usePostMutations"
import styles from "./PostCard.module.css"

dayjs.extend(relativeTime)

// ── Helpers ───────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// ── Content with "see more" ───────────────────────────────────

function PostContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 220
  const isLong = text.length > LIMIT

  const display = isLong && !expanded ? text.slice(0, LIMIT).trimEnd() + "…" : text

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
  post: Post
  queryParams: FetchPostsParams  // passed down so like mutation targets the right cache key
}

export default function PostCard({ post, queryParams }: PostCardProps) {
  const { like, unlike } = useLikePost(queryParams)
  const pending = like.isPending || unlike.isPending

  const handleLike = () => {
    if (pending) return
    if (post.is_liked) unlike.mutate(post.id)
    else              like.mutate(post.id)
  }

  const timeAgo = dayjs(post.created_at).fromNow()

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
          {post.likes_count > 0 && (
            <span className={styles.statItem}>
              <span className={styles.statIconLike}>
                <Icon icon="mdi:lightning-bolt" width={12} height={12} />
              </span>
              {fmtCount(post.likes_count)}
            </span>
          )}
          {post.comments_count > 0 && (
            <span className={styles.statItem} style={{ marginLeft: "auto" }}>
              {fmtCount(post.comments_count)} comment{post.comments_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* ── Action bar ── */}
      <div className={styles.actions}>

        <button
          className={`${styles.actionBtn} ${post.is_liked ? styles.actionBtnLiked : ""}`}
          onClick={handleLike}
          disabled={pending}
          type="button"
          aria-pressed={post.is_liked}
          aria-label={post.is_liked ? "Unlike" : "Like"}
        >
          <Icon
            icon={post.is_liked ? "mdi:lightning-bolt" : "mdi:lightning-bolt-outline"}
            width={20}
            height={20}
          />
          <span>{post.is_liked ? "Liked" : "Like"}</span>
        </button>

        <button
          className={styles.actionBtn}
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

    </article>
  )
}