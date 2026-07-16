"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { Icon } from "@iconify/react"
import { usePostComments, useCreateComment } from "@/features/posts/hooks/usePostMutations"
import { useAuthStore } from "@/store/auth.store"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import CommentItem from "./CommentItem"
import type { PostComment } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

interface PostCommentsProps {
  postId: string
  commentsCount?: number
  onClose: () => void
}

export default function PostComments({ postId, commentsCount, onClose }: PostCommentsProps) {
  const [text, setText] = useState("")
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Where to scroll once the new comment/reply lands (after the optimistic
  // cache update re-renders the list).
  const pendingScrollRef = useRef<{ type: "top" } | { type: "reply"; parentId: string } | null>(null)

  const toast = useToast()
  const currentUser = useAuthStore(s => s.user)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = usePostComments(postId)
  const { mutate, isPending } = useCreateComment()

  const comments = data?.pages.flatMap(p => p.results) || []
  const count = commentsCount ?? comments.length

  // Keep onClose reachable from the one-shot history effect without making it a dep.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // Route every close through the back stack so the close button, Esc, backdrop
  // and the hardware back gesture behave identically (and don't navigate away).
  const requestClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.goatzaCommentsSheet) {
      window.history.back()   // → popstate → onClose
    } else {
      onCloseRef.current()
    }
  }, [])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [requestClose])

  // Reserve ONE history entry so the mobile back button/gesture closes the sheet
  // instead of navigating away. Guarded with a ref so StrictMode's double-invoked
  // effect pushes only once; cleanup never calls back() (which would self-close).
  const pushedRef = useRef(false)
  useEffect(() => {
    if (!pushedRef.current) {
      window.history.pushState({ goatzaCommentsSheet: true }, "")
      pushedRef.current = true
    }
    const onPop = () => onCloseRef.current()
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus()
  }, [replyingTo])

  // After the thread updates (optimistic insert re-renders `data`), bring the
  // new comment/reply into view — a top-level comment lands at the top, a reply
  // sits under its parent — so it's visible even if the user had scrolled down.
  useEffect(() => {
    const target = pendingScrollRef.current
    if (!target) return
    pendingScrollRef.current = null
    requestAnimationFrame(() => {
      const list = listRef.current
      if (!list) return
      if (target.type === "top") {
        list.scrollTo({ top: 0, behavior: "smooth" })
      } else {
        list
          .querySelector<HTMLElement>(`[data-comment-id="${target.parentId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    })
  }, [data])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isPending) return

    const parent = replyingTo
    // Snappy: clear the composer immediately; restore it if the post fails.
    setText("")
    setReplyingTo(null)
    pendingScrollRef.current = parent ? { type: "reply", parentId: parent.id } : { type: "top" }

    mutate(
      { post_id: postId, comment: trimmed, parent_id: parent?.id },
      {
        onError: () => {
          setText(trimmed)
          if (parent) setReplyingTo(parent)
          pendingScrollRef.current = null
          toast.show({
            title: "Couldn't post your comment",
            variant: "error",
            position: "top-right",
            duration: 3500,
          })
        },
      }
    )
  }

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) requestClose()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Comments"
    >
      <div className={styles.sheet}>
        {/* Drag handle (mobile) */}
        <div className={styles.handle} aria-hidden="true" />

        {/* Header */}
        <header className={styles.header}>
          <h3 className={styles.headerTitle}>
            Comments{count > 0 ? ` · ${count}` : ""}
          </h3>
          <button className={styles.closeBtn} onClick={requestClose} type="button" aria-label="Close">
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </header>

        {/* Scrollable list */}
        <div className={styles.list} ref={listRef}>
          {isLoading ? (
            <div className={styles.stateMsg}>Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon icon="mdi:comment-text-outline" width={34} height={34} />
              <p className={styles.emptyTitle}>No comments yet</p>
              <p className={styles.emptyBody}>Be the first to comment.</p>
            </div>
          ) : (
            <>
              {comments.map(c => (
                <CommentItem key={c.id} comment={c} onReply={setReplyingTo} onNavigate={onClose} />
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
            </>
          )}
        </div>

        {/* Pinned composer */}
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
                <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
                  <Icon icon="mdi:close" width={14} height={14} />
                </button>
              </div>
            )}
            <div className={styles.composeRow}>
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
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
