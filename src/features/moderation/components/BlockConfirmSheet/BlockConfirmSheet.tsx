"use client"

/**
 * The ONE confirm sheet every block entry point opens — profile ⋯, chat ⋯,
 * post ⋯. One component so the copy cannot drift between them: three sheets
 * describing the same irreversible-feeling action in three slightly different
 * ways is how people end up unsure what they just did.
 *
 * Body copy is verbatim from the flow doc §1.3, and the last sentence is the
 * load-bearing one: **they won't be notified**. That is the single fact that
 * decides whether someone feels safe pressing the button.
 *
 * A portal + bottom sheet, matching PostOptionsSheet — this is a PWA and every
 * other confirm in the app comes up from the bottom edge on mobile.
 */

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useBlock } from "../../hooks/useModerationQueries"
import type { BlockTargetType } from "../../services/moderation.api"
import styles from "./BlockConfirmSheet.module.css"

export interface BlockConfirmSheetProps {
  targetType: BlockTargetType
  targetId: string
  username: string
  /** Display name, when known — the sheet falls back to the handle. */
  name?: string
  onClose: () => void
  /**
   * Fired after the block lands. The entry points use it to update in place:
   * the post menu drops the author's cards from the feed, the chat header
   * flips to the blocked composer.
   */
  onBlocked?: () => void
}

export default function BlockConfirmSheet({
  targetType,
  targetId,
  username,
  name,
  onClose,
  onBlocked,
}: BlockConfirmSheetProps) {
  const block = useBlock()
  const backdropRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while open — same as PostOptionsSheet.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

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

  const handleConfirm = () => {
    block.mutate(
      { target_type: targetType, target_id: targetId, username },
      {
        onSuccess: () => {
          onBlocked?.()
          onClose()
        },
        // On failure the sheet STAYS open with the error toast behind it, so
        // the action is still one tap away instead of needing the whole menu
        // journey again.
      }
    )
  }

  const label = name || username

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="block-confirm-title"
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />

        <span className={styles.mark} aria-hidden="true">
          <Icon icon="mdi:account-cancel-outline" width={26} height={26} />
        </span>

        <h3 id="block-confirm-title" className={styles.title}>
          Block @{username}?
        </h3>

        {/* §1.3, verbatim. */}
        <p className={styles.text}>
          They won&apos;t be able to follow you, message you, or see your posts.
          They won&apos;t be notified.
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={block.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.blockBtn}
            onClick={handleConfirm}
            disabled={block.isPending}
            aria-label={`Block ${label}`}
          >
            {block.isPending ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Blocking…
              </>
            ) : (
              "Block"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
