"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import styles from "./CreateMenu.module.css"

/**
 * A single creation action shown in the create menu.
 * Add a new entry to the `actions` array to expose another action — that's the
 * only change required to grow the menu.
 */
export interface CreateAction {
  id: string
  label: string
  sublabel?: string
  icon: string
  onSelect: () => void
}

interface CreateMenuProps {
  open: boolean
  onClose: () => void
  actions: CreateAction[]
}

function ActionRow({
  action,
  onClose,
}: {
  action: CreateAction
  onClose: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.menuItem}
      onClick={() => {
        action.onSelect()
        onClose()
      }}
    >
      <span className={styles.menuItemIcon} aria-hidden="true">
        <Icon icon={action.icon} width={20} height={20} />
      </span>
      <span className={styles.menuItemText}>
        <span className={styles.menuItemLabel}>{action.label}</span>
        {action.sublabel && (
          <span className={styles.menuItemSub}>{action.sublabel}</span>
        )}
      </span>
    </button>
  )
}

/**
 * CreateMenu — responsive "create" action menu that mirrors the AccountSwitcher
 * surfaces: an anchored dropdown on desktop (≥768px) and a bottom sheet on
 * mobile (<768px). Both surfaces render the same data-driven `actions`.
 *
 * The dropdown renders inline so it can anchor to the "+" trigger (its parent
 * must be `position: relative`). The sheet is portaled to <body> so it is not
 * trapped under the desktop top-nav, which is `display: none` on mobile.
 */
export default function CreateMenu({ open, onClose, actions }: CreateMenuProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Esc closes either surface.
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Click-outside closes the desktop dropdown only — the mobile sheet dismisses
  // via its own backdrop, so we skip this below 768px.
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!window.matchMedia("(min-width: 768px)").matches) return
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Desktop: anchored dropdown (auto-hidden < 768px) */}
      <div ref={dropdownRef} className={styles.dropdownWrap}>
        <div className={styles.menu} role="menu" aria-label="Create">
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} onClose={onClose} />
          ))}
        </div>
      </div>

      {/* Mobile: bottom sheet (portaled to body, hidden ≥ 768px) */}
      {createPortal(
        <div
          className={styles.sheetBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Create"
        >
          <div className={styles.sheetModal}>
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <div className={styles.sheetSpacer} />
              <h2 className={styles.sheetTitle}>Create</h2>
              <button
                className={styles.sheetCloseBtn}
                onClick={onClose}
                aria-label="Close"
                type="button"
              >
                <Icon icon="mdi:close" width={20} height={20} />
              </button>
            </div>
            <div className={styles.sheetContent} role="menu" aria-label="Create">
              {actions.map((action) => (
                <ActionRow key={action.id} action={action} onClose={onClose} />
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
