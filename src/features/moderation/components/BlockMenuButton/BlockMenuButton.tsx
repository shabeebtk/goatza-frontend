"use client"

/**
 * The chat thread's "⋯" menu.
 *
 * The chat header had no overflow menu before this — Block is its first (and
 * so far only) entry, which is why this is a small self-contained button
 * rather than a row added to something existing. When a second thread-level
 * action arrives (Report, Mute), it belongs in here beside Block.
 *
 * Hidden entirely once the pair is blocked: the way back is Settings →
 * Blocked accounts, or the profile banner. Offering "Block" on a thread that
 * is already blocked is the kind of dead control that makes people doubt
 * whether the first tap worked.
 */

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"

import BlockConfirmSheet from "../BlockConfirmSheet/BlockConfirmSheet"
import type { BlockTargetType } from "../../services/moderation.api"
import styles from "./BlockMenuButton.module.css"

export interface BlockMenuButtonProps {
  targetType: BlockTargetType
  targetId: string
  username: string
  name?: string
  /** Already blocked — the menu is not rendered at all. */
  isBlocked?: boolean
}

export default function BlockMenuButton({
  targetType,
  targetId,
  username,
  name,
  isBlocked = false,
}: BlockMenuButtonProps) {
  const [open, setOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  if (isBlocked) return null

  return (
    <span className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon="mdi:dots-vertical" width={20} height={20} />
      </button>

      {open && (
        <>
          {/* Click-outside catcher as a sibling, not a document listener, so a
              tap on the trigger toggles instead of closing-then-reopening —
              same approach as ProfileShareMenu. */}
          <span
            className={styles.scrim}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div className={styles.menu} role="menu">
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${styles.itemDanger}`}
              onClick={() => {
                setOpen(false)
                setSheetOpen(true)
              }}
            >
              <Icon icon="mdi:account-cancel-outline" width={17} height={17} />
              Block @{username}
            </button>
          </div>
        </>
      )}

      {sheetOpen && (
        <BlockConfirmSheet
          targetType={targetType}
          targetId={targetId}
          username={username}
          name={name}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </span>
  )
}
