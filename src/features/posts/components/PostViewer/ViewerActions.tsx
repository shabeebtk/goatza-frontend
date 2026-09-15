"use client"

/**
 * ViewerActions — Like, Comment, Share, Save (and More on the phone) for the
 * post on screen. The phone renders it as the vertical rail; desktop as the
 * compact row above the comments.
 *
 * Same contract as PostActions: on a public profile viewed logged out every
 * button stays visible and opens the login wall instead of firing an
 * authenticated mutation. ReactionButton already does that for likes.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"
import ReactionButton from "@/features/posts/components/PostActions/ReactionButton"
import PostSharePreview from "@/features/posts/components/PostSharePreview/PostSharePreview"
import { useToggleSave } from "@/features/posts/hooks/usePostMutations"
import type { FetchPostsParams, Post } from "@/features/posts/services/posts.api"
import { fmtCount } from "@/features/posts/utils/format"
import ShareSheet from "@/features/messages/components/ShareSheet/ShareSheet"
import { usePublicProfile } from "@/features/profile/context/PublicProfileContext"
import { postUrl } from "@/shared/services/postUrl"
import styles from "./ViewerActions.module.css"

interface ViewerActionsProps {
  post: Post
  queryParams: FetchPostsParams
  variant: "rail" | "panel"
  onComment: () => void
  /** Phone only — the ⋯ button; desktop keeps it in the panel header. */
  onMore?: () => void
}

export default function ViewerActions({
  post,
  queryParams,
  variant,
  onComment,
  onMore,
}: ViewerActionsProps) {
  const publicView = usePublicProfile()
  const [shareOpen, setShareOpen] = useState(false)
  const { mutate: toggleSave, isPending: isSaving } = useToggleSave()

  const isRail = variant === "rail"
  const btn = isRail ? styles.railBtn : styles.panelBtn
  const icon = isRail ? styles.railIcon : styles.panelIcon
  const label = isRail ? styles.railLabel : styles.panelLabel
  const iconSize = isRail ? 28 : 24
  const isSaved = post.is_saved ?? false

  return (
    <div className={isRail ? styles.rail : styles.panel}>
      <ReactionButton
        post={post}
        queryParams={queryParams}
        variant={variant}
        // The rail hugs the right edge: the picker has to open inwards.
        pickerPlacement={isRail ? "left" : "above"}
      />

      <button
        type="button"
        className={btn}
        aria-label="Comment"
        onClick={
          publicView
            ? () => publicView.openLoginWall("comment on posts from")
            : onComment
        }
      >
        <span className={icon}>
          <Icon icon="mdi:comment-outline" width={iconSize} height={iconSize} />
        </span>
        <span className={label}>
          {isRail ? fmtCount(post.comments_count) : "Comment"}
        </span>
      </button>

      {/* Walled rather than dropped: sharing INTO a chat needs an account. */}
      <button
        type="button"
        className={btn}
        aria-label="Share"
        onClick={() =>
          publicView
            ? publicView.openLoginWall("share posts from")
            : setShareOpen(true)
        }
      >
        <span className={icon}>
          <Icon icon="mdi:send-outline" width={iconSize} height={iconSize} />
        </span>
        <span className={label}>{isRail ? "" : "Share"}</span>
      </button>

      {/* Saves are per-ACTOR — the actor headers do that, nothing to branch on. */}
      <button
        type="button"
        className={`${btn} ${isSaved ? styles.saved : ""}`}
        aria-label={isSaved ? "Remove from saved" : "Save post"}
        aria-pressed={isSaved}
        disabled={isSaving}
        onClick={() =>
          publicView
            ? publicView.openLoginWall("save posts from")
            : toggleSave({ post_id: post.id })
        }
      >
        <span className={icon}>
          <Icon
            icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"}
            width={iconSize}
            height={iconSize}
          />
        </span>
        <span className={label}>{isRail ? "" : isSaved ? "Saved" : "Save"}</span>
      </button>

      {onMore && (
        <button
          type="button"
          className={btn}
          aria-label="More options"
          onClick={
            publicView
              ? () => publicView.openLoginWall("save posts from")
              : onMore
          }
        >
          <span className={icon}>
            <Icon icon="mdi:dots-horizontal" width={iconSize} height={iconSize} />
          </span>
        </button>
      )}

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
