"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useCloseOnScroll } from "@/shared/hooks/useCloseOnScroll"
import { useMediaQuery } from "@/shared/hooks/useMediaQuery"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useChangeRecruitmentStatus, useIsOrgReviewer } from "../../hooks/useRecruitments"
import { STATUS_TRANSITIONS, type RecruitmentStatusAction } from "../../statusTransitions"
import type { RecruitmentStatus } from "../../services/recruitments.api"
import styles from "./StatusChangeMenu.module.css"

/**
 * StatusChangeMenu — responsive chooser for the owner to move a recruitment
 * through its lifecycle. Desktop: anchored dropdown. Mobile: bottom sheet
 * (mirrors the AccountSwitcher sheet pattern). Only valid next-statuses are
 * offered; the server stays authoritative on legality.
 *
 * DELETE sits at the bottom, after a divider, in EVERY status — cancelled
 * included. It is not a transition (it is not in STATUS_TRANSITIONS); it hands
 * off to the parent's DeleteRecruitmentDialog, because this menu unmounts as
 * it closes. Owners and admins only — the server refuses anyone else.
 */

interface StatusChangeMenuProps {
  open: boolean
  onClose: () => void
  recruitmentId: string
  currentStatus: RecruitmentStatus
  /** The owning org — whose `my_role` decides whether Delete is offered. */
  orgId?: string
  /** Opens the delete dialog. Without it there is no Delete row. */
  onDelete?: () => void
}

export default function StatusChangeMenu({
  open,
  onClose,
  recruitmentId,
  currentStatus,
  orgId,
  onDelete,
}: StatusChangeMenuProps) {
  const actions = STATUS_TRANSITIONS[currentStatus] ?? []
  const canDelete = useIsOrgReviewer(orgId) && !!onDelete
  const [confirming, setConfirming] = useState<RecruitmentStatusAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { mutateAsync, isPending } = useChangeRecruitmentStatus()

  // The sheet covers the page, so it locks it; the anchored dropdown closes
  // when the page scrolls instead (never mid-request).
  const isMobile = useMediaQuery("(max-width: 767px)")
  useBodyScrollLock(open && isMobile)
  useCloseOnScroll(open && !isMobile && !isPending, onClose)

  // Note: the parent mounts this only while open, so each open starts with
  // fresh `confirming`/`error` state — no reset effect needed.

  // Esc closes (unless a request is in-flight).
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, isPending, onClose])

  // Click-outside closes the desktop dropdown only (the sheet has its own backdrop).
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (isPending) return
      if (!window.matchMedia("(min-width: 768px)").matches) return
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, isPending, onClose])

  const run = async (action: RecruitmentStatusAction) => {
    setError(null)
    try {
      await mutateAsync({ recruitmentId, status: action.to })
      toast.show({ title: action.toast, variant: "success" })
      onClose()
    } catch (err) {
      // Server is the source of truth — show its message, don't flip optimistically.
      setError(getApiErrorMessage(err, "Couldn't update the status. Please try again."))
    }
  }

  const select = (action: RecruitmentStatusAction) => {
    if (isPending) return
    setError(null)
    if (action.destructive) setConfirming(action)
    else run(action)
  }

  if (!open) return null

  const body = confirming ? (
    <div className={styles.confirmPanel} role="alertdialog" aria-label="Confirm status change">
      <span className={styles.confirmIcon} aria-hidden="true">
        <Icon icon="mdi:alert-outline" width={22} height={22} />
      </span>
      <p className={styles.confirmTitle}>{confirming.confirmTitle ?? `${confirming.label}?`}</p>
      {confirming.confirmBody && <p className={styles.confirmBody}>{confirming.confirmBody}</p>}
      {error && (
        <p className={styles.error} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={13} height={13} />
          {error}
        </p>
      )}
      <div className={styles.confirmActions}>
        <button
          className={styles.btnGhost}
          type="button"
          onClick={() => { setConfirming(null); setError(null) }}
          disabled={isPending}
        >
          Back
        </button>
        <button
          className={styles.btnDanger}
          type="button"
          onClick={() => run(confirming)}
          disabled={isPending}
        >
          {isPending ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <Icon icon={confirming.icon} width={15} height={15} />
          )}
          {confirming.label}
        </button>
      </div>
    </div>
  ) : (
    <div className={styles.menuList} role="menu" aria-label="Change status">
      {actions.map((action) => (
        <button
          key={action.to}
          type="button"
          role="menuitem"
          className={`${styles.menuItem} ${action.destructive ? styles.menuItemDanger : ""}`}
          onClick={() => select(action)}
          disabled={isPending}
        >
          <span className={styles.menuItemIcon} aria-hidden="true">
            {isPending ? (
              <span className={styles.spinner} />
            ) : (
              <Icon icon={action.icon} width={18} height={18} />
            )}
          </span>
          <span className={styles.menuItemText}>
            <span className={styles.menuItemLabel}>{action.label}</span>
            <span className={styles.menuItemHelper}>{action.helper}</span>
          </span>
        </button>
      ))}
      {canDelete && (
        <>
          {actions.length > 0 && <div className={styles.divider} role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => onDelete?.()}
            disabled={isPending}
          >
            <span className={styles.menuItemIcon} aria-hidden="true">
              <Icon icon="mdi:delete-outline" width={18} height={18} />
            </span>
            <span className={styles.menuItemText}>
              <span className={styles.menuItemLabel}>Delete</span>
              <span className={styles.menuItemHelper}>Remove it from Goatza for good</span>
            </span>
          </button>
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={13} height={13} />
          {error}
        </p>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop: anchored dropdown (hidden < 768px) */}
      <div ref={dropdownRef} className={styles.dropdownWrap}>
        <div className={styles.menu}>{body}</div>
      </div>

      {/* Mobile: bottom sheet (portaled to body, hidden ≥ 768px) */}
      {createPortal(
        <div
          className={styles.sheetBackdrop}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPending) onClose()
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Change status"
        >
          <div className={styles.sheetModal}>
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHeader}>
              <div className={styles.sheetSpacer} />
              <h2 className={styles.sheetTitle}>Change status</h2>
              <button
                className={styles.sheetCloseBtn}
                type="button"
                onClick={onClose}
                aria-label="Close"
                disabled={isPending}
              >
                <Icon icon="mdi:close" width={20} height={20} />
              </button>
            </div>
            <div className={styles.sheetContent}>{body}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
