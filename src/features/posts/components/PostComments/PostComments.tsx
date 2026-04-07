"use client"

import { useState, useRef, useEffect } from "react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { Icon } from "@iconify/react"
import { usePostComments, useCreateComment } from "@/features/posts/hooks/usePostMutations"
import { useAuthStore } from "@/store/auth.store"
import CommentItem from "./CommentItem"
import type { PostComment } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

export default function PostComments({ postId }: { postId: string }) {
  const [text, setText] = useState("")
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const currentUser = useAuthStore(s => s.user)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = usePostComments(postId)
  const { mutate, isPending } = useCreateComment()

  const comments = data?.pages.flatMap(p => p.results) || []

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus()
  }, [replyingTo])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || isPending) return

    mutate(
      { post_id: postId, comment: text, parent_id: replyingTo?.id },
      {
        onSuccess: () => {
          setText("")
          setReplyingTo(null)
        }
      }
    )
  }

  return (
    <div className={styles.container}>
      <form className={styles.composeForm} onSubmit={handleSubmit}>
        <Avatar 
            src={currentUser?.profile_photo} 
            initials={currentUser?.name?.slice(0, 2)} 
            size="md" 
        />
        <div className={styles.composeInputWrap}>
          {replyingTo && (
            <div className={styles.replyingBadge}>
              <span>Replying to {replyingTo.actor.name}</span>
              <button type="button" onClick={() => setReplyingTo(null)}>
                <Icon icon="mdi:close" width={14} height={14} />
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            className={styles.inputField}
            placeholder="Write a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isPending}
          />
          <button 
            type="submit" 
            className={styles.sendBtn} 
            disabled={!text.trim() || isPending}
            aria-label="Send"
          >
            <Icon 
              icon={isPending ? "mdi:loading" : "mdi:send"} 
              className={isPending ? styles.spin : ""} 
              width={18} 
              height={18} 
            />
          </button>
        </div>
      </form>

      <div className={styles.list}>
        {comments.map(c => (
          <CommentItem key={c.id} comment={c} onReply={setReplyingTo} />
        ))}
        {hasNextPage && (
          <button 
            className={styles.loadMoreBtn} 
            onClick={() => fetchNextPage()} 
            disabled={isFetchingNextPage}
            type="button"
          >
            {isFetchingNextPage ? "Loading..." : "Load more comments"}
          </button>
        )}
      </div>
    </div>
  )
}
