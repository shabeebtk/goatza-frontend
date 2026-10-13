"use client"

/**
 * DeleteRecruitmentDialog — the owner/admin's "Delete" from the status menu.
 *
 * WHAT IT ASKS DEPENDS ON WHO IS WAITING, and the server decides that
 * (`/delete-check`, the same function the delete itself runs):
 *
 *   needs_note false  a plain confirm — a draft, a past trial, or nobody
 *                     still in play. Nobody is messaged.
 *   needs_note true   people are waiting on the club: a note (10–500 chars)
 *                     is required, and each of them gets it by notification
 *                     and email.
 *   can_delete false  a coach or staff member — told why, no Delete button.
 *
 * Centred card from 768px, bottom sheet below — the split StatusChangeMenu
 * and Select use. It has a text field, so it follows the VISIBLE area
 * (useVisualViewport) and Delete keeps the keyboard up while tapped.
 */

import { useEffect, useId, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"
import { useToast } from "@/shared/components/ui/Toast/Toast"
import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { useBackToClose } from "@/shared/hooks/useBackToClose"
import { useVisualViewport } from "@/shared/hooks/useVisualViewport"
import { blurActiveInput, keepFocusProps } from "@/shared/hooks/keepFocus"
import {
  getApiErrorMessage,
  getApiFieldErrors,
} from "@/core/api/getApiErrorMessage"
import { useDeleteCheck, useDeleteRecruitment } from "../../hooks/useRecruitments"
import styles from "./DeleteRecruitmentDialog.module.css"

// The server's bounds — it is the one that enforces them.
const NOTE_MIN = 10
const NOTE_MAX = 500

interface DeleteRecruitmentDialogProps {
  recruitmentId: string
  /** The admin list it returns to once the recruitment is gone. */
  orgId: string
  onClose: () => void
}

export default function DeleteRecruitmentDialog({
  recruitmentId,
  orgId,
  onClose,
}: DeleteRecruitmentDialogProps) {
  const toast = useToast()
  const noteId = useId()
  const check = useDeleteCheck(recruitmentId, true)
  const { mutate, isPending } = useDeleteRecruitment()

  const [note, setNote] = useState("")
  const [noteError, setNoteError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useBodyScrollLock()
  useVisualViewport()
  const { requestClose, navigateAway } = useBackToClose(onClose)

  const close = () => {
    if (!isPending) requestClose()
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) requestClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isPending, requestClose])

  const needsNote = check.data?.needs_note ?? false
  const notifyCount = check.data?.notify_count ?? 0
  const canDelete = check.data?.can_delete ?? false
  const noteReady = !needsNote || note.trim().length >= NOTE_MIN

  const submit = () => {
    if (isPending || !noteReady) return
    blurActiveInput()
    setError(null)
    setNoteError(null)

    mutate(
      // A note is only sent when one is asked for — the server drops it
      // otherwise, and nothing it is not going to store should travel.
      { recruitmentId, note: needsNote ? note.trim() : undefined },
      {
        onSuccess: () => {
          toast.show({ title: "Recruitment deleted", variant: "success" })
          // Pops this dialog's history entry first, so back from the list
          // does not land on a dead recruitment page.
          navigateAway(`/organization/admin/${orgId}/recruitments`)
        },
        onError: (err) => {
          const fieldErrors = getApiFieldErrors(err)
          if (fieldErrors?.note) setNoteError(fieldErrors.note)
          else setError(getApiErrorMessage(err, "Couldn't delete this recruitment."))
        },
      },
    )
  }

  const waitingLine =
    `${notifyCount} player${notifyCount === 1 ? "" : "s"} applied and ` +
    `${notifyCount === 1 ? "is" : "are"} still waiting. They'll get your note ` +
    `by notification and email.`

  let content: React.ReactNode
  if (check.isLoading) {
    content = (
      <p className={styles.loading} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        Checking who&apos;s waiting on this trial…
      </p>
    )
  } else if (check.isError || !check.data) {
    content = (
      <>
        <p className={styles.errorLine} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
          {getApiErrorMessage(check.error, "Couldn't check this recruitment.")}
        </p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} type="button" onClick={close}>
            Close
          </button>
        </div>
      </>
    )
  } else if (!canDelete) {
    content = (
      <>
        <p className={styles.text}>Only owners and admins can delete a recruitment.</p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} type="button" onClick={close}>
            Close
          </button>
        </div>
      </>
    )
  } else {
    content = (
      <>
        <p className={styles.text}>
          It will be removed from Goatza for good. This can&apos;t be undone.
        </p>

        {needsNote && (
          <>
            <div className={styles.warning}>
              <Icon icon="mdi:account-clock-outline" width={18} height={18} />
              <span>{waitingLine}</span>
            </div>

            <label className={styles.label} htmlFor={noteId}>
              Note to applicants
            </label>
            <textarea
              id={noteId}
              className={`${styles.textarea} ${noteError ? styles.textareaError : ""}`}
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                if (noteError) setNoteError(null)
              }}
              placeholder="The trial is called off — the ground isn't available. Sorry for the trouble."
              rows={4}
              maxLength={NOTE_MAX}
              disabled={isPending}
              aria-invalid={!!noteError}
              aria-describedby={`${noteId}-meta`}
            />
            <div className={styles.noteMeta} id={`${noteId}-meta`}>
              {noteError ? (
                <span className={styles.noteError} role="alert">{noteError}</span>
              ) : (
                <span className={styles.noteHint}>
                  {note.trim().length < NOTE_MIN ? `At least ${NOTE_MIN} characters.` : ""}
                </span>
              )}
              <span className={styles.counter}>{note.length}/{NOTE_MAX}</span>
            </div>
          </>
        )}

        {error && (
          <p className={styles.errorLine} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={14} height={14} />
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            className={styles.cancelBtn}
            type="button"
            onClick={close}
            disabled={isPending}
            {...keepFocusProps}
          >
            Cancel
          </button>
          <button
            className={styles.deleteBtn}
            type="button"
            onClick={submit}
            disabled={isPending || !noteReady}
            {...keepFocusProps}
          >
            {isPending ? (
              <span className={styles.spinner} aria-hidden="true" />
            ) : (
              <Icon icon="mdi:delete-outline" width={16} height={16} />
            )}
            Delete
          </button>
        </div>
      </>
    )
  }

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${noteId}-title`}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.scroll}>
          <span className={styles.mark} aria-hidden="true">
            <Icon icon="mdi:delete-outline" width={22} height={22} />
          </span>
          <h2 className={styles.title} id={`${noteId}-title`}>
            Delete this recruitment?
          </h2>
          {content}
        </div>
      </div>
    </div>,
    document.body,
  )
}
