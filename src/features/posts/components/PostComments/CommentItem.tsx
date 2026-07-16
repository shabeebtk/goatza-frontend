"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Link from "next/link"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { useNavigation } from "@/shared/services/navigation.service"
import { resolveCommentAuthorType, commentActorAvatar } from "@/features/posts/utils/comment"
import type { PostComment, ReplyPreview } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

dayjs.extend(relativeTime)

function ReplyItem({ reply, onNavigate }: { reply: ReplyPreview; onNavigate?: () => void }) {
  const { toProfile } = useNavigation()
  const href = toProfile(reply.actor.username, resolveCommentAuthorType(reply.actor))

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
      </div>
    </div>
  )
}

export default function CommentItem({
  comment,
  onReply,
  onNavigate,
}: {
  comment: PostComment
  onReply: (c: PostComment) => void
  onNavigate?: () => void
}) {
  const { toProfile } = useNavigation()
  const hasMoreReplies = comment.replies_count > (comment.replies_preview?.length || 0)
  const href = toProfile(
    comment.actor.username,
    resolveCommentAuthorType(comment.actor, comment.actor_type),
  )

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
        </div>

        <div className={styles.commentActions}>
          <button className={styles.commentActionBtn} onClick={() => onReply(comment)}>
            Reply
          </button>
        </div>

        {/* Replies Hint / Preview */}
        {comment.replies_preview && comment.replies_preview.length > 0 && (
          <div className={styles.repliesContainer}>
            {comment.replies_preview.map(rp => (
              <ReplyItem key={rp.id} reply={rp} onNavigate={onNavigate} />
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
