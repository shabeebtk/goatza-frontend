"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useRouter } from "next/navigation"
import { useDeletePost } from "../../hooks/usePostMutations"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import styles from "./PostOptionsSheet.module.css"

interface PostOptionsSheetProps {
  postId: string
  isOwn: boolean
  isPreview? : boolean
  onClose: () => void
}

export default function PostOptionsSheet({
  postId,
  isOwn,
  isPreview=false,
  onClose,
}: PostOptionsSheetProps) {
  const router = useRouter()
  const toast = useToast()
  const { mutate: deletePost, isPending: isDeleting } = useDeletePost(isPreview ? { mode: "preview" } : {})
  const backdropRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const handleDelete = () => {
    deletePost(postId, {
      onSuccess: () => {
        toast.show({
          title: "Post deleted",
          variant: "success",
          position: "top-right",
          duration: 3000,
        })
        onClose()
      },
      onError: () => {
        toast.show({
          title: "Failed to delete post",
          variant: "error",
          position: "top-right",
          duration: 4000,
        })
      },
    })
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Post options"
    >
      <div className={styles.sheet}>
        {/* Drag handle (mobile) */}
        <div className={styles.handle} aria-hidden="true" />

        {/* Options */}
        <div className={styles.options}>
          {isOwn ? (
            <>
              {/* Delete — only owner */}
              <button
                className={`${styles.option} ${styles.optionDanger}`}
                onClick={handleDelete}
                disabled={isDeleting}
                type="button"
              >
                <span className={styles.optionIcon}>
                  {isDeleting ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : (
                    <Icon icon="mdi:trash-can-outline" width={20} height={20} />
                  )}
                </span>
                <span className={styles.optionLabel}>
                  {isDeleting ? "Deleting…" : "Delete Post"}
                </span>
              </button>

              {/* Edit — placeholder for later */}
              <button
                className={styles.option}
                onClick={() => {
                  onClose()
                  // router.push(`/posts/${postId}/edit`) — wire when ready
                }}
                type="button"
              >
                <span className={styles.optionIcon}>
                  <Icon icon="mdi:pencil-outline" width={20} height={20} />
                </span>
                <span className={styles.optionLabel}>Edit Post</span>
              </button>
            </>
          ) : (
            <>
              {/* Report — non-owner */}
              <button
                className={`${styles.option} ${styles.optionDanger}`}
                onClick={onClose}
                type="button"
              >
                <span className={styles.optionIcon}>
                  <Icon icon="mdi:flag-outline" width={20} height={20} />
                </span>
                <span className={styles.optionLabel}>Report Post</span>
              </button>

              {/* Unfollow — non-owner */}
              <button
                className={styles.option}
                onClick={onClose}
                type="button"
              >
                <span className={styles.optionIcon}>
                  <Icon icon="mdi:account-minus-outline" width={20} height={20} />
                </span>
                <span className={styles.optionLabel}>Unfollow</span>
              </button>
            </>
          )}

          {/* Copy link — always */}
          <button
            className={styles.option}
            onClick={() => {
              navigator.clipboard
                .writeText(`${window.location.origin}/posts/${postId}`)
                .then(() => {
                  toast.show({
                    title: "Link copied",
                    icon: "mdi:link",
                    position: "bottom-center",
                    duration: 2000,
                  })
                })
              onClose()
            }}
            type="button"
          >
            <span className={styles.optionIcon}>
              <Icon icon="mdi:link-variant" width={20} height={20} />
            </span>
            <span className={styles.optionLabel}>Copy Link</span>
          </button>
        </div>

        {/* Cancel */}
        <button
          className={styles.cancelBtn}
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}