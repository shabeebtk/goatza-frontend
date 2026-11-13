"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import styles from "./SquadSheet.module.css"

/**
 * The surface every squads overlay stands on: a bottom sheet on a phone, a dialog
 * from 768px. The same behaviour as orgMembers' MembersSheet, copied rather than
 * shared so neither feature's sheet changes under the other. It follows the overlay
 * rules in CLAUDE.md: scroll lock, one history entry so Android's back closes it,
 * and the visible area so the footer stays above the keyboard. Mounts only while
 * open, like ConfirmDialog.
 *
 * `children` and `footer` are functions so the content can close the sheet through
 * `close`, which is what consumes the history entry it pushed.
 */
export default function SquadSheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  footer?: (close: () => void) => ReactNode
  children: (close: () => void) => ReactNode
}) {
  useBodyScrollLock()
  useVisualViewport()
  const { requestClose } = useBackToClose(onClose)

  return (
    <Portal>
      <div
        className={styles.backdrop}
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose()
        }}
      >
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
          <div className={styles.handle} aria-hidden="true" />
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={requestClose}
              aria-label="Close"
            >
              <Icon icon="mdi:close" width={20} height={20} />
            </button>
          </div>
          <div className={styles.body}>{children(requestClose)}</div>
          {footer && <div className={styles.footer}>{footer(requestClose)}</div>}
        </div>
      </div>
    </Portal>
  )
}
