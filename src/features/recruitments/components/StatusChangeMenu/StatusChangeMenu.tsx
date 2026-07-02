"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import { useChangeRecruitmentStatus } from "../../hooks/useRecruitments"
import { STATUS_TRANSITIONS, type RecruitmentStatusAction } from "../../statusTransitions"
import type { RecruitmentStatus } from "../../services/recruitments.api"
import styles from "./StatusChangeMenu.module.css"

/**
 * StatusChangeMenu — responsive chooser for the owner to move a recruitment
 * through its lifecycle. Desktop: anchored dropdown. Mobile: bottom sheet
 * (mirrors the AccountSwitcher sheet pattern). Only valid next-statuses are
 * offered; the server stays authoritative on legality.
 */

interface StatusChangeMenuProps {
  open: boolean
  onClose: () => void
  recruitmentId: string
  currentStatus: RecruitmentStatus
}

export default function StatusChangeMenu({
  open,
  onClose,
  recruitmentId,
  currentStatus,
}: StatusChangeMenuProps) {
  const actions = STATUS_TRANSITIONS[currentStatus] ?? []
  const [confirming, setConfirming] = useState<RecruitmentStatusAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { mutateAsync, isPending } = useChangeRecruitmentStatus()

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
