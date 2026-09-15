"use client"

/**
 * CommentsThread — a post's comments: the list, "load more", reply state, the
 * pinned composer and the scroll-to-new-comment behaviour.
 *
 * Pulled out of PostComments so the same thread can sit inside the bottom
 * sheet / desktop modal (PostComments) AND inside the full-screen viewer's
 * side panel. It renders a fragment — header slot, list, composer — so the
 * host's flex column lays the three out exactly as PostComments' sheet did.
 *
 * `onNavigate` receives the href of the author link that was clicked; the
 * host decides how to leave (PostComments closes its overlay entries first so
 * back from the profile returns to the list). A modified click (⌘/Ctrl/Shift,
 * middle button) is left to the browser so "open in new tab" keeps working.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import Avatar from "@/shared/components/ui/Avatar/Avatar"
import { Icon } from "@iconify/react"
import { usePostComments, useCreateComment, useDeleteComment } from "@/features/posts/hooks/usePostMutations"
import type { DeleteCommentVars } from "@/features/posts/hooks/usePostMutations"
import { useAuthStore } from "@/store/auth.store"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { blurActiveInput, keepFocusProps } from "@/shared/hooks/keepFocus"
import CommentItem from "./CommentItem"
import type { PostComment } from "@/features/posts/services/posts.api"
import styles from "./PostComments.module.css"

/** What a host can ask of the thread — the viewer's Comment button focuses the composer. */
export interface CommentsThreadHandle {
  focusComposer: () => void
}

interface CommentsThreadProps {
  postId: string
  /** The post's own count; falls back to what has loaded. */
  commentsCount?: number
  /** Active actor owns the post → may delete any comment on it. */
  isPostOwner?: boolean
  /** An author link was clicked; `href` is where it points. */
  onNavigate?: (href: string) => void
  /** Rendered above the list with the resolved count (title, close button…). */
  renderHeader?: (count: number) => ReactNode
  ref?: Ref<CommentsThreadHandle>
}

function isModifiedClick(e: React.MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

export default function CommentsThread({
  postId,
  commentsCount,
  isPostOwner = false,
  onNavigate,
  renderHeader,
  ref,
}: CommentsThreadProps) {
  const [text, setText] = useState("")
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Where to scroll once the new comment/reply lands (after the optimistic
  // cache update re-renders the list).
  const pendingScrollRef = useRef<{ type: "top" } | { type: "reply"; parentId: string } | null>(null)

  const toast = useToast()
  const currentUser = useAuthStore(s => s.user)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = usePostComments(postId)
  const { mutate, isPending } = useCreateComment()
  const { mutate: deleteComment } = useDeleteComment()

  useImperativeHandle(ref, () => ({
    focusComposer: () => inputRef.current?.focus(),
  }), [])

  const handleDeleteComment = useCallback((vars: DeleteCommentVars) => {
    deleteComment(vars, {
      onError: () => toast.show({
        title: "Couldn't delete comment",
        variant: "error",
        position: "top-right",
        duration: 3000,
      }),
    })
  }, [deleteComment, toast])

  const comments = data?.pages.flatMap(p => p.results) || []
  const count = commentsCount ?? comments.length

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

    // The send button keeps focus in the input while it is tapped
    // (keepFocusProps), so the keyboard is closed here, on purpose.
    blurActiveInput()

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

  // Without a host handler the <Link> navigates on its own, as before.
  const handleNavigate = onNavigate
    ? (href: string, e: React.MouseEvent<HTMLAnchorElement>) => {
        // Already taken by a host further up (the viewer captures every
        // internal link), or meant for a new tab.
        if (e.defaultPrevented || isModifiedClick(e)) return
        e.preventDefault()
        onNavigate(href)
      }
    : undefined

  return (
    <>
      {renderHeader?.(count)}

      {/* Scrollable list. Scrolling it closes the keyboard on purpose, the way
          native apps do — rather than a later tap doing it by accident. */}
      <div
        className={styles.list}
        ref={listRef}
        onScroll={blurActiveInput}
        onTouchMove={blurActiveInput}
      >
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
              <CommentItem
                key={c.id}
                comment={c}
                postId={postId}
                isPostOwner={isPostOwner}
                onReply={setReplyingTo}
                onDelete={handleDeleteComment}
                onNavigate={handleNavigate}
              />
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
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                {...keepFocusProps}
              >
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
              // A tap on Send must not blur the input first: on iOS the
              // keyboard would close, the sheet would move and the click
              // would miss the button. The submit closes it afterwards.
              {...keepFocusProps}
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
    </>
  )
}
