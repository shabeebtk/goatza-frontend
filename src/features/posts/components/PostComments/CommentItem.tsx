"use client"

import { useEffect, useRef, useState } from "react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Link from "next/link"
import { Icon } from "@iconify/react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import ReportSheet from "@/features/moderation/components/ReportSheet/ReportSheet"
import { useNavigation } from "@/shared/services/navigation.service"
import { useAuthStore } from "@/store/auth.store"
import { resolveCommentAuthorType, commentActorAvatar } from "@/features/posts/utils/comment"
import type { DeleteCommentVars } from "@/features/posts/hooks/usePostMutations"
import type { CommentActor, PostComment, ReplyPreview } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

dayjs.extend(relativeTime)

// ── Small 3-dot menu ──────────────────────────────────────────
//
// Used to render only for someone who could DELETE. It now also carries
// Report, which is offered on exactly the opposite set of comments — anything
// the active actor did not write — so the menu itself appears whenever either
// row would. A post owner reading a stranger's comment sees both.

function CommentMenu({
  onDelete,
  onReport,
}: {
  onDelete?: () => void
  onReport?: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  if (!onDelete && !onReport) return null

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        type="button"
        className={styles.menuBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label="Comment options"
      >
        <Icon icon="mdi:dots-horizontal" width={16} height={16} />
      </button>
      {open && (
        <div className={styles.menuDropdown} role="menu">
          {onReport && (
            <button
              type="button"
              className={styles.menuItemDanger}
              onClick={() => { setOpen(false); onReport() }}
              role="menuitem"
            >
              <Icon icon="mdi:flag-outline" width={15} height={15} />
              Report
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={styles.menuItemDanger}
              onClick={() => { setOpen(false); onDelete() }}
              role="menuitem"
            >
              <Icon icon="mdi:trash-can-outline" width={15} height={15} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Whether the active actor authored a comment/reply.
function useIsActiveAuthor() {
  const user = useAuthStore((s) => s.user)
  const actorType = useAuthStore((s) => s.actorType)
  const currentOrg = useAuthStore((s) => s.currentOrganization)

  return (actor: CommentActor, authorType: "user" | "organization") =>
    authorType === "organization"
      ? actorType === "organization" && currentOrg?.id === actor.id
      : actorType === "user" && user?.id === actor.id
}

// ── Reply row ─────────────────────────────────────────────────

function ReplyItem({
  reply,
  postId,
  parentId,
  isPostOwner,
  onDelete,
  onNavigate,
}: {
  reply: ReplyPreview
  postId: string
  parentId: string
  isPostOwner: boolean
  onDelete: (vars: DeleteCommentVars) => void
  onNavigate?: () => void
}) {
  const { toProfile } = useNavigation()
  const isActiveAuthor = useIsActiveAuthor()
  const authorType = resolveCommentAuthorType(reply.actor)
  const href = toProfile(reply.actor.username, authorType)
  const canDelete = isPostOwner || isActiveAuthor(reply.actor, authorType)
  // Reportable by anyone who did not write it — including a post owner, who
  // can both remove it from their own post and tell us why it was there.
  const canReport = !isActiveAuthor(reply.actor, authorType)
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <div className={styles.replyItem}>
      <Link
        href={href}
        onClick={onNavigate}
        className={styles.actorLink}
        aria-label={`View ${reply.actor.name}'s profile`}
      >
        <Avatar
          src={commentActorAvatar(reply.actor)}
          initials={reply.actor.name.slice(0, 2).toUpperCase()}
          size="sm"
        />
      </Link>
      <div className={styles.replyContentBox}>
        <div className={styles.replyHeader}>
          <Link href={href} onClick={onNavigate} className={styles.commentName}>
            {reply.actor.name}
          </Link>
          <span className={styles.commentTime}>{dayjs(reply.created_at).fromNow(true)}</span>
        </div>
        <p className={styles.commentText}>
          {reply.reply_to && reply.reply_to.id !== reply.actor.id && (
            <span className={styles.replyToTag}>@{reply.reply_to.username} </span>
          )}
          {reply.comment}
        </p>
        <CommentMenu
          onDelete={
            canDelete
              ? () => onDelete({ commentId: reply.id, postId, parentId })
              : undefined
          }
          onReport={canReport ? () => setReportOpen(true) : undefined}
        />
      </div>

      {reportOpen && (
        <ReportSheet
          targetType="comment"
          targetId={reply.id}
          username={reply.actor.username}
          blockTarget={{
            type: authorType,
            id: reply.actor.id,
            username: reply.actor.username,
            name: reply.actor.name,
          }}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}

// ── Comment row ───────────────────────────────────────────────

export default function CommentItem({
  comment,
  postId,
  isPostOwner,
  onReply,
  onDelete,
  onNavigate,
}: {
  comment: PostComment
  postId: string
  isPostOwner: boolean
  onReply: (c: PostComment) => void
  onDelete: (vars: DeleteCommentVars) => void
  onNavigate?: () => void
}) {
  const { toProfile } = useNavigation()
  const isActiveAuthor = useIsActiveAuthor()
  const hasMoreReplies = comment.replies_count > (comment.replies_preview?.length || 0)
  const authorType = resolveCommentAuthorType(comment.actor, comment.actor_type)
  const href = toProfile(comment.actor.username, authorType)
  const canDelete = isPostOwner || isActiveAuthor(comment.actor, authorType)
  const canReport = !isActiveAuthor(comment.actor, authorType)
  const [reportOpen, setReportOpen] = useState(false)

  return (
    <div className={styles.commentRow} data-comment-id={comment.id}>
      <Link
        href={href}
        onClick={onNavigate}
        className={styles.actorLink}
        aria-label={`View ${comment.actor.name}'s profile`}
      >
        <Avatar
          src={commentActorAvatar(comment.actor)}
          initials={comment.actor.name.slice(0, 2).toUpperCase()}
          size="md"
        />
      </Link>
      <div className={styles.commentBody}>
        <div className={styles.commentContentBox}>
          <div className={styles.commentHeader}>
            <Link href={href} onClick={onNavigate} className={styles.commentName}>
              {comment.actor.name}
            </Link>
            <span className={styles.commentTime}>{dayjs(comment.created_at).fromNow(true)}</span>
          </div>
          <p className={styles.commentText}>{comment.comment}</p>
          <CommentMenu
            onDelete={
              canDelete
                ? () =>
                    onDelete({
                      commentId: comment.id,
                      postId,
                      repliesCount: comment.replies_count,
                    })
                : undefined
            }
            onReport={canReport ? () => setReportOpen(true) : undefined}
          />
        </div>

        {reportOpen && (
          <ReportSheet
            targetType="comment"
            targetId={comment.id}
            username={comment.actor.username}
            blockTarget={{
              type: authorType,
              id: comment.actor.id,
              username: comment.actor.username,
              name: comment.actor.name,
            }}
            onClose={() => setReportOpen(false)}
          />
        )}

        <div className={styles.commentActions}>
          <button className={styles.commentActionBtn} onClick={() => onReply(comment)}>
            Reply
          </button>
        </div>

        {/* Replies Hint / Preview */}
        {comment.replies_preview && comment.replies_preview.length > 0 && (
          <div className={styles.repliesContainer}>
            {comment.replies_preview.map((rp) => (
              <ReplyItem
                key={rp.id}
                reply={rp}
                postId={postId}
                parentId={comment.id}
                isPostOwner={isPostOwner}
                onDelete={onDelete}
                onNavigate={onNavigate}
              />
            ))}
            {hasMoreReplies && (
              <button
                className={styles.viewMoreReplies}
                onClick={() => { /* future: expand full thread */ }}
              >
                View {comment.replies_count - comment.replies_preview.length} more replies
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
