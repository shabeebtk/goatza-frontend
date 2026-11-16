"use client"

import type { ReactNode } from "react"
import { Icon } from "@iconify/react"

import Portal from "@/shared/components/ui/Portal/Portal"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import styles from "./InstallSheet.module.css"

/**
 * The surface the install sheets stand on: a bottom sheet on a phone, a dialog
 * from 768px. Follows the overlay rules in CLAUDE.md: the one scroll lock, and
 * one history entry so Android's back closes the sheet rather than the page.
 * No text input lives in these sheets, so it needs no visual-viewport tracking.
 * Mount it only while open.
 *
 * `children` and `footer` are functions so the content can close the sheet
 * through `close`, which consumes the history entry the sheet pushed, or
 * leave for another page through `navigateAway`, which closes it first.
 */
export default function InstallSheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: string
  onClose: () => void
  footer?: (close: () => void, navigateAway: (href: string) => void) => ReactNode
  children: (close: () => void, navigateAway: (href: string) => void) => ReactNode
}) {
  useBodyScrollLock()
  const { requestClose, navigateAway } = useBackToClose(onClose)

  return (
    <Portal>
      <div
        className={styles.backdrop}
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") requestClose()
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
              autoFocus
            >
              <Icon icon="mdi:close" width={20} height={20} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.body}>{children(requestClose, navigateAway)}</div>
          {footer && <div className={styles.footer}>{footer(requestClose, navigateAway)}</div>}
        </div>
      </div>
    </Portal>
  )
}
