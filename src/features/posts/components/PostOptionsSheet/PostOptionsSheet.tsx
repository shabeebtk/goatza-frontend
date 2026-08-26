"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useRouter } from "next/navigation"
import { useDeletePost, useToggleSave } from "../../hooks/usePostMutations"
import { usePromoteToHighlights } from "@/features/highlights/hooks/usePromoteToHighlights"
import { formatClipDuration } from "@/features/highlights/visibilityMeta"
import BlockConfirmSheet from "@/features/moderation/components/BlockConfirmSheet/BlockConfirmSheet"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import type { PostMedia } from "../../services/posts.api"
import styles from "./PostOptionsSheet.module.css"

interface PostOptionsSheetProps {
  postId: string
  isOwn: boolean
  isPreview? : boolean
  /** Whether the ACTIVE ACTOR has saved this post (drives the save row's copy). */
  isSaved?: boolean
  /**
   * Video items of this post. Present only when the viewer may promote them —
   * the post's own author, a player, acting as themselves (PostCard decides).
   */
  promotableVideos?: PostMedia[]
  onClose: () => void
  onEdit?: () => void
  /**
   * The post's author, so the sheet can offer "Block author". Omitted on an
   * own post (there is nobody to block) and by any caller that has not wired
   * it — the row simply does not render.
   */
  author?: {
    id: string
    username: string
    name?: string
    type: "user" | "organization"
  }
}

export default function PostOptionsSheet({
  postId,
  isOwn,
  isPreview=false,
  isSaved = false,
  promotableVideos = [],
  onClose,
  onEdit,
  author,
}: PostOptionsSheetProps) {
  const router = useRouter()
  const toast = useToast()
  const { mutate: deletePost, isPending: isDeleting } = useDeletePost(isPreview ? { mode: "preview" } : {})
  // Saves are per-ACTOR: acting as an org, this saves for the org. The actor
  // headers do that, so there is nothing to branch on here.
  const { mutate: toggleSave } = useToggleSave()
  const backdropRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Second step of "Add to Highlights" when the post carries several videos.
  const [pickVideo, setPickVideo] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)

  // Never on your own post, and never without an author to name.
  const canBlock = !isOwn && Boolean(author)

  const { promote, isPromoting } = usePromoteToHighlights()
  const canPromote = promotableVideos.length > 0

  const addToHighlights = (mediaId: string) => {
    // Close on completion either way — the result is a toast, not sheet state.
    promote(mediaId, { onDone: onClose })
  }

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

        {confirmDelete ? (
          /* ── Delete confirmation ── */
          <div className={styles.confirm} role="alertdialog" aria-label="Delete post">
            <span className={styles.confirmIcon}>
              <Icon icon="mdi:trash-can-outline" width={26} height={26} />
            </span>
            <h3 className={styles.confirmTitle}>Delete this post?</h3>
            <p className={styles.confirmText}>
              This can&rsquo;t be undone. The post and its media will be permanently removed.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancelBtn}
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={isDeleting}
                type="button"
              >
                {isDeleting ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        ) : pickVideo ? (
          /* ── Which video? (multi-video post) ── */
          <div className={styles.picker}>
            <h3 className={styles.pickerTitle}>Which clip?</h3>
            <p className={styles.pickerText}>
              This post has {promotableVideos.length} videos — pick the one to add
              to your highlights.
            </p>

            <div className={styles.pickerGrid}>
              {promotableVideos.map((media, i) => (
                <button
                  key={media.id}
                  type="button"
                  className={styles.pickerItem}
                  onClick={() => addToHighlights(media.id)}
                  disabled={isPromoting}
                >
                  {media.thumbnail_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={media.thumbnail_url}
                      alt=""
                      className={styles.pickerThumb}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <span className={styles.pickerThumbFallback} aria-hidden="true">
                      <Icon icon="mdi:video-outline" width={20} height={20} />
                    </span>
                  )}
                  <span className={styles.pickerMeta}>
                    Clip {i + 1}
                    {formatClipDuration(media.duration) &&
                      ` · ${formatClipDuration(media.duration)}`}
                  </span>
                </button>
              ))}
            </div>

            <button
              className={styles.cancelBtn}
              onClick={() => setPickVideo(false)}
              type="button"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            {/* Options */}
            <div className={styles.options}>
              {/* Save — first, and offered on every post regardless of who
                  wrote it. Saves are private to the saver, so nothing about
                  this is visible to the author. */}
              <button
                className={styles.option}
                onClick={() => {
                  toggleSave({ post_id: postId })
                  onClose()
                }}
                type="button"
              >
                <span className={styles.optionIcon}>
                  <Icon
                    icon={isSaved ? "mdi:bookmark" : "mdi:bookmark-outline"}
                    width={20}
                    height={20}
                  />
                </span>
                <span className={styles.optionLabel}>
                  {isSaved ? "Remove from Saved" : "Save Post"}
                </span>
              </button>

              {/* Own-post edits — safe, reversible, so they sit up here with
                  the rest of the everyday actions. */}
              {isOwn && (
                <>
                  {/* Add to Highlights — own video posts, player acting as self */}
                  {canPromote && (
                    <button
                      className={styles.option}
                      onClick={() => {
                        if (promotableVideos.length === 1) {
                          addToHighlights(promotableVideos[0].id)
                          return
                        }
                        setPickVideo(true)
                      }}
                      disabled={isPromoting}
                      type="button"
                    >
                      <span className={styles.optionIcon}>
                        <Icon icon="mdi:play-box-outline" width={20} height={20} />
                      </span>
                      <span className={styles.optionLabel}>
                        {isPromoting ? "Adding…" : "Add to Highlights"}
                      </span>
                    </button>
                  )}

                  {/* Edit — opens the edit modal */}
                  <button
                    className={styles.option}
                    onClick={() => {
                      onClose()
                      onEdit?.()
                    }}
                    type="button"
                  >
                    <span className={styles.optionIcon}>
                      <Icon icon="mdi:pencil-outline" width={20} height={20} />
                    </span>
                    <span className={styles.optionLabel}>Edit Post</span>
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

              {/* ── Destructive, always LAST ──
                  Delete and Report are the two rows you can't casually undo,
                  so they sit furthest from the thumb's resting position and
                  below every safe action. Exactly one of them shows. */}
              {isOwn ? (
                <button
                  className={`${styles.option} ${styles.optionDanger}`}
                  onClick={() => setConfirmDelete(true)}
                  type="button"
                >
                  <span className={styles.optionIcon}>
                    <Icon icon="mdi:trash-can-outline" width={20} height={20} />
                  </span>
                  <span className={styles.optionLabel}>Delete Post</span>
                </button>
              ) : (
                <>
                  {canBlock && (
                    <button
                      className={`${styles.option} ${styles.optionDanger}`}
                      onClick={() => setBlockOpen(true)}
                      type="button"
                    >
                      <span className={styles.optionIcon}>
                        <Icon
                          icon="mdi:account-cancel-outline"
                          width={20}
                          height={20}
                        />
                      </span>
                      <span className={styles.optionLabel}>Block author</span>
                    </button>
                  )}

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
                </>
              )}
            </div>

            {/* Cancel */}
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {blockOpen && author && (
        <BlockConfirmSheet
          targetType={author.type}
          targetId={author.id}
          username={author.username}
          name={author.name}
          onClose={() => setBlockOpen(false)}
          // The feed cards are already filtered out by useBlock; closing the
          // options sheet too leaves the user back on a feed that no longer
          // contains the post they were looking at.
          onBlocked={onClose}
        />
      )}
    </div>,
    document.body
  )
}