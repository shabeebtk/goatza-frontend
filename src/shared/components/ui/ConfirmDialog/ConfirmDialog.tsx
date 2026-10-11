"use client"

/**
 * ConfirmDialog — the app's one "are you sure?".
 *
 * Before this, a destructive action either asked with `window.confirm` (a
 * browser chrome box that cannot be styled, cannot be themed, and on iOS
 * steals the page's scroll position) or did not ask at all — which is how
 * "Log out" sat one mis-tap away from the end of a session on a phone.
 *
 * It behaves like every other overlay here, deliberately:
 *
 * - portalled to <body>, so no transformed ancestor can trap or clip it;
 * - `role="alertdialog"` + `aria-modal`, named by its own title and described
 *   by its message, because the question IS the content;
 * - focus trapped inside, the confirm button focused on open, and focus
 *   handed back to whatever opened it through `returnFocus` (the ring is the
 *   keyboard's, not the tap's);
 * - `useBodyScrollLock` so the page cannot move underneath, and
 *   `useBackToClose` so Android's back gesture ANSWERS the question with
 *   "no" instead of leaving the page;
 * - every way out — Esc, the backdrop, Cancel, Confirm — goes through
 *   `requestClose()`, so the one history entry it pushed is always consumed.
 *   Which answer it was is remembered first, in a ref: the hook only calls
 *   back when the pop has landed.
 *
 * A centred card on desktop, a bottom sheet below 768px.
 */

import { useEffect, useId, useRef } from "react"
import Portal from "@/shared/components/ui/Portal/Portal"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { returnFocus } from "@/shared/services/focusReturn"
import styles from "./ConfirmDialog.module.css"

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** "danger" paints the confirm button red. Default: "default". */
  tone?: "default" | "danger"
  onConfirm: () => void
  onCancel: () => void
}

/** Focusables inside the dialog, for the Tab trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea'

export default function ConfirmDialog({ open, ...rest }: ConfirmDialogProps) {
  // The body mounts only while open, so the scroll lock and the history entry
  // belong to one asking of one question — no `enabled` flags threaded
  // through hooks that would otherwise run for the life of the page.
  if (!open) return null
  return (
    <Portal>
      <ConfirmDialogBody {...rest} />
    </Portal>
  )
}

function ConfirmDialogBody({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, "open">) {
  const titleId = useId()
  const messageId = `${titleId}-message`
  const panelRef = useRef<HTMLDivElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  /** What to give focus back to; captured before we move it. */
  const openerRef = useRef<HTMLElement | null>(null)
  /** The answer, read once the close has landed. Cancel unless told otherwise. */
  const answerRef = useRef<"confirm" | "cancel">("cancel")
  // Kept fresh in an effect (never written during render), so the close
  // callback the history hook holds is never a stale handler.
  const handlersRef = useRef({ onConfirm, onCancel })
  useEffect(() => { handlersRef.current = { onConfirm, onCancel } })

  useBodyScrollLock()

  const { requestClose } = useBackToClose(() => {
    const { onConfirm: confirm, onCancel: cancel } = handlersRef.current
    if (answerRef.current === "confirm") confirm()
    else cancel()
  })

  const answer = (choice: "confirm" | "cancel") => {
    answerRef.current = choice
    requestClose()
  }

  // The confirm button holds focus on open: it is the answer the dialog is
  // asking about, and Esc/Cancel are both one key away from it.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    confirmRef.current?.focus({ preventScroll: true })
    return () => {
      returnFocus(openerRef.current)
      openerRef.current = null
    }
  }, [])

  // Esc answers "no". Tab cannot leave: a question with a focusable page
  // behind it is a question the reader can walk away from mid-sentence.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        answer("cancel")
        return
      }
      if (event.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  })

  return (
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) answer("cancel")
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.title}>{title}</h2>
        <p id={messageId} className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => answer("cancel")}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`${styles.confirmBtn} ${tone === "danger" ? styles.confirmBtnDanger : ""}`}
            onClick={() => answer("confirm")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
