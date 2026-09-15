"use client"

/**
 * PostActions
 *
 * The card's action bar: Like (with the reaction picker), Comment, Share.
 * The like button itself lives in ReactionButton — the full-screen viewer
 * renders the same one in its rail / panel — and this only lays the three out
 * and wires the share sheet.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import type { Post, FetchPostsParams } from "@/features/posts/services/posts.api"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import PostSharePreview from "@/features/posts/components/PostSharePreview/PostSharePreview"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { postUrl } from "@/shared/services/postUrl"
import ReactionButton from "./ReactionButton"
import styles from "./PostActions.module.css"

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
  // Non-null only on a public profile viewed logged out. Every action below
  // routes through the wall instead of firing an authenticated mutation — the
  // buttons stay visible on purpose, because a post with no affordances reads
  // as broken and converts nobody.
  const publicView = usePublicProfile()

  const [shareOpen, setShareOpen] = useState(false)

  return (
    <div className={styles.actionsBar}>

      {/* ── Like / Reaction button ── */}
      <ReactionButton post={post} queryParams={queryParams} variant="bar" />

      {/* ── Comment ── */}
      <button
        type="button"
        className={styles.actionBtn}
        onClick={
          publicView
            ? () => publicView.openLoginWall("comment on posts from")
            : onCommentClick
        }
        aria-label="Comment"
      >
        <span className={styles.actionIcon}>
          <Icon icon="mdi:comment-outline" width={20} height={20} />
        </span>
        <span className={styles.actionLabel}>Comment</span>
      </button>

      {/* ── Share ──
          Walled rather than dropped: sharing INTO a chat needs an account.
          The profile header's own share menu is the anonymous route out —
          Copy link and native share work there with no session. */}
      <button
        type="button"
        className={styles.actionBtn}
        aria-label="Share"
        onClick={() =>
          publicView
            ? publicView.openLoginWall("share posts from")
            : setShareOpen(true)
        }
      >
        <span className={styles.actionIcon}>
          <Icon icon="mdi:send-outline" width={20} height={20} />
        </span>
        <span className={styles.actionLabel}>Share</span>
      </button>


      {/* ── Share sheet ── */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={{ type: "post", id: post.id }}
        shareUrl={postUrl(post.id)}
        previewNode={
          <PostSharePreview
            authorName={post.author.name}
            thumbnailUrl={
              post.media[0]?.thumbnail_url || post.media[0]?.file_url || undefined
            }
            textSnippet={post.content}
          />
        }
      />

    </div>
  )
}
