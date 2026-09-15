"use client"

/**
 * PostComments — the comments overlay: a bottom sheet on phones, a centred
 * modal on desktop. The thread itself (list, composer, reply state) is
 * CommentsThread; this owns the chrome, the scroll lock and the back button.
 */

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import CommentsThread from "./CommentsThread"
import styles from "./PostComments.module.css"

interface PostCommentsProps {
  postId: string
  commentsCount?: number
  /** Active actor owns the post → may delete any comment on it. */
  isPostOwner?: boolean
  onClose: () => void
}

export default function PostComments({ postId, commentsCount, isPostOwner = false, onClose }: PostCommentsProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Reserve ONE history entry so the mobile back button/gesture closes the sheet
  // instead of navigating away, and route every close through it so the close
  // button, Esc, backdrop and the hardware back gesture behave identically.
  // Stacks: opened over the post viewer, one back closes only this sheet.
  const { requestClose, navigateAway } = useBackToClose(onClose)

  // Lock body scroll while open
  useBodyScrollLock()

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [requestClose])

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

        <CommentsThread
          postId={postId}
          commentsCount={commentsCount}
          isPostOwner={isPostOwner}
          // An author link leaves through the overlay stack, so back from the
          // profile returns to the list rather than to an empty sheet entry.
          onNavigate={navigateAway}
          renderHeader={(count) => (
            <header className={styles.header}>
              <h3 className={styles.headerTitle}>
                Comments{count > 0 ? ` · ${count}` : ""}
              </h3>
              <button className={styles.closeBtn} onClick={requestClose} type="button" aria-label="Close">
                <Icon icon="mdi:close" width={20} height={20} />
              </button>
            </header>
          )}
        />
      </div>
    </div>,
    document.body
  )
}
