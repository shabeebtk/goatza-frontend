"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import type { PostComment, ReplyPreview } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

dayjs.extend(relativeTime)

function ReplyItem({ reply }: { reply: ReplyPreview }) {
  return (
    <div className={styles.replyItem}>
      <Avatar
        src={reply.actor.profile_photo}
        initials={reply.actor.name.slice(0, 2).toUpperCase()}
        size="sm"
      />
      <div className={styles.replyContentBox}>
        <div className={styles.replyHeader}>
          <span className={styles.commentName}>{reply.actor.name}</span>
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

export default function CommentItem({ comment, onReply }: { comment: PostComment, onReply: (c: PostComment) => void }) {
  const hasMoreReplies = comment.replies_count > (comment.replies_preview?.length || 0)

  return (
    <div className={styles.commentRow}>
      <Avatar
        src={comment.actor.profile_photo}
        initials={comment.actor.name.slice(0, 2).toUpperCase()}
        size="md"
      />
      <div className={styles.commentBody}>
        <div className={styles.commentContentBox}>
          <div className={styles.commentHeader}>
            <span className={styles.commentName}>{comment.actor.name}</span>
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
              <ReplyItem key={rp.id} reply={rp} />
            ))}
            {hasMoreReplies && (
              <button className={styles.viewMoreReplies} onClick={() => { /* Can expand full thread in future */ }}>
                View {comment.replies_count - comment.replies_preview.length} more replies
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
