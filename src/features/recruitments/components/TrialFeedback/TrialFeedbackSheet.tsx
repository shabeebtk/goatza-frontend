"use client"

/**
 * TrialFeedbackSheet — "How did the trial go?", asked once and got out of the
 * way. Bottom sheet on a phone, centred dialog from 640px, following
 * ApplyRecruitmentModal's shell (portal, useBodyScrollLock, the same backdrop
 * and slide-up) so it reads as part of the app.
 *
 * TWO STEPS, AND THE FIRST ONE CAN END IT.
 *
 *   step 1   Did you go?      "No, I couldn't" SUBMITS IMMEDIATELY
 *   step 2   What happened?   outcome + rating (+ an optional note)
 *
 * THE ONE-TAP EXIT IS THE MOST IMPORTANT THING HERE. Somebody who missed the
 * trial is the least motivated person who will ever open this, and a form
 * about a thing they did not attend is exactly how you teach them to ignore
 * the prompt next time. So "No, I couldn't" posts `{attended: false}` on the
 * tap — the server blanks the outcome and the rating for it — and thanks them.
 *
 * WHY THE RATING IS REQUIRED ON STEP 2: the server requires it whenever
 * attended is true, so Submit stays disabled until a star is chosen AND says
 * why in a line. Only greying a button leaves somebody tapping a dead control
 * with no idea what is missing.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useBodyScrollLock } from "@/shared/hooks/useBodyScrollLock"
import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"
import StarRating from "../StarRating/StarRating"
import { useSubmitTrialFeedback } from "../../hooks/useRecruitments"
import type {
  SelfReportedOutcome,
  TrialFeedbackPayload,
} from "../../services/recruitments.api"
import styles from "./TrialFeedbackSheet.module.css"

const NOTE_MAX = 1000
// Past this the counter appears. Showing "0 / 1000" from the first keystroke
// reads as a demand for length on a field that is optional.
const NOTE_COUNTER_FROM = 800

const OUTCOMES: { value: SelfReportedOutcome; label: string; hint: string }[] = [
  {
    value: "selected",
    label: "I was selected",
    hint: "They told you you're in",
  },
  {
    value: "not_selected",
    label: "I wasn't selected",
    hint: "They told you it's a no",
  },
  {
    // MOST PLAYERS LAND HERE, and the option has to exist or they pick one of
    // the two above wrongly — or close the sheet and answer nothing.
    value: "waiting",
    label: "Still waiting to hear",
    hint: "No word yet — you can update this later",
  },
]

type Step = "attended" | "details" | "done"

type TrialFeedbackSheetProps = {
  applicationId: string
  /** Invalidates that recruitment's detail too, where it embeds the answer. */
  recruitmentId?: string
  /** Named in the privacy line — a player deserves to know exactly who reads it. */
  orgName?: string
  /** Prefills for an edit: a player who said "waiting" coming back to update. */
  initialOutcome?: SelfReportedOutcome | ""
  initialRating?: number | null
  initialFeedback?: string
  onClose: () => void
}

export default function TrialFeedbackSheet({
  applicationId,
  recruitmentId,
  orgName,
  initialOutcome = "",
  initialRating = null,
  initialFeedback = "",
  onClose,
}: TrialFeedbackSheetProps) {
  // An edit already knows they attended — asking again would be absurd.
  const isEdit = !!initialOutcome || initialRating !== null
  const [step, setStep] = useState<Step>(isEdit ? "details" : "attended")
  const [outcome, setOutcome] = useState<SelfReportedOutcome | "">(initialOutcome)
  const [rating, setRating] = useState<number | null>(initialRating)
  const [note, setNote] = useState(initialFeedback)
  const [showWhy, setShowWhy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which branch we are thanking them for: it changes the one line shown.
  const [didAttend, setDidAttend] = useState(true)

  const { mutate, isPending } = useSubmitTrialFeedback()
  const panelRef = useRef<HTMLDivElement>(null)

  useBodyScrollLock()

  // ESCAPE, and FOCUS INTO the sheet on open. Without the move, focus stays on
  // the prompt row behind the backdrop and a keyboard user's next Tab walks
  // the page underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, isPending])

  useEffect(() => {
    // The panel itself, not the first control: landing on "No, I couldn't"
    // would put a submit under the very first keypress.
    panelRef.current?.focus()
  }, [])

  // FOCUS TRAP. A modal that lets Tab escape into the page behind it is a
  // modal only visually. Cycles within the panel, both directions.
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return

    const panel = panelRef.current
    if (!panel) return

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement)

    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const submit = (payload: TrialFeedbackPayload) => {
    setError(null)
    setDidAttend(payload.attended)

    mutate(
      { applicationId, recruitmentId, payload },
      {
        onSuccess: () => setStep("done"),
        // The server's own words, and the sheet STAYS OPEN with their answers
        // intact — a thrown-away form is worse than the error.
        onError: (err) => setError(getApiErrorMessage(err)),
      }
    )
  }

  const submitDetails = () => {
    if (rating === null || !outcome) {
      setShowWhy(true)
      return
    }
    submit({
      attended: true,
      outcome,
      rating,
      feedback: note.trim() || undefined,
    })
  }

  const backdropClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isPending) onClose()
  }

  if (typeof document === "undefined") return null

  const missing =
    rating === null && !outcome
      ? "Pick what happened and a rating to submit."
      : !outcome
        ? "Pick what happened to submit."
        : "Choose a rating to submit."

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={backdropClose}
      role="dialog"
      aria-modal="true"
      aria-label="How did the trial go?"
    >
      <div
        className={styles.panel}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
      >
        {/* ── Step 3: it landed ─────────────────────────────── */}
        {step === "done" ? (
          <div className={styles.doneBody}>
            <span className={styles.doneTick}>
              <Icon icon="mdi:check-circle" width={48} height={48} />
            </span>
            <p className={styles.doneLine}>
              {didAttend
                ? "Thanks — this helps the organisation."
                : "Thanks for letting them know."}
            </p>
            <button className={styles.primaryBtn} type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className={styles.head}>
              <div className={styles.headText}>
                <h2 className={styles.title}>
                  {step === "attended" ? "Did you go to the trial?" : "What happened?"}
                </h2>
                {step === "details" && !isEdit && (
                  <button
                    className={styles.backBtn}
                    type="button"
                    onClick={() => setStep("attended")}
                    disabled={isPending}
                  >
                    <Icon icon="mdi:arrow-left" width={14} height={14} />
                    Back
                  </button>
                )}
              </div>
              <button
                className={styles.closeBtn}
                type="button"
                onClick={onClose}
                disabled={isPending}
                aria-label="Close"
              >
                <Icon icon="mdi:close" width={20} height={20} />
              </button>
            </div>

            <div className={styles.body}>
              {/* ── Step 1 ─────────────────────────────────── */}
              {step === "attended" && (
                <div className={styles.bigChoices}>
                  <button
                    className={styles.bigBtn}
                    type="button"
                    onClick={() => setStep("details")}
                    disabled={isPending}
                  >
                    <Icon icon="mdi:check-circle-outline" width={20} height={20} />
                    Yes, I went
                  </button>
                  {/* ONE TAP AND DONE. No form, no follow-up. */}
                  <button
                    className={`${styles.bigBtn} ${styles.bigBtnQuiet}`}
                    type="button"
                    onClick={() => submit({ attended: false })}
                    disabled={isPending}
                  >
                    <Icon icon="mdi:calendar-remove-outline" width={20} height={20} />
                    {isPending ? "Sending…" : "No, I couldn't"}
                  </button>
                </div>
              )}

              {/* ── Step 2 ─────────────────────────────────── */}
              {step === "details" && (
                <>
                  <div
                    className={styles.outcomes}
                    role="radiogroup"
                    aria-label="What happened?"
                    aria-required="true"
                  >
                    {OUTCOMES.map((option) => {
                      const checked = outcome === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          tabIndex={checked || (!outcome && option.value === "selected") ? 0 : -1}
                          className={`${styles.outcomeRow} ${checked ? styles.outcomeRowOn : ""}`}
                          onClick={() => setOutcome(option.value)}
                          disabled={isPending}
                        >
                          <span className={styles.radioDot} aria-hidden="true">
                            {checked && <span className={styles.radioDotInner} />}
                          </span>
                          <span className={styles.outcomeText}>
                            <span className={styles.outcomeLabel}>{option.label}</span>
                            <span className={styles.outcomeHint}>{option.hint}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>How was the trial?</span>
                    <StarRating
                      value={rating}
                      onChange={setRating}
                      label="How was the trial?"
                      size="lg"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="trial-feedback-note">
                      Anything to add?{" "}
                      <span className={styles.optional}>(optional)</span>
                    </label>
                    <textarea
                      id="trial-feedback-note"
                      className={styles.textarea}
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                      maxLength={NOTE_MAX}
                      rows={3}
                      placeholder="How it was run, what you'd tell another player…"
                      disabled={isPending}
                    />
                    <div className={styles.noteFoot}>
                      {/* NOT FINE PRINT. Body size, directly under the field:
                          somebody writing honest criticism is owed a plain
                          statement of who reads it. */}
                      <p className={styles.privacy}>
                        Only {orgName || "the organisation"} sees this.
                      </p>
                      {note.length > NOTE_COUNTER_FROM && (
                        <span className={styles.counter}>
                          {note.length} / {NOTE_MAX}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <p className={styles.error} role="alert">
                  <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
                  {error}
                </p>
              )}
            </div>

            {step === "details" && (
              <div className={styles.foot}>
                {showWhy && (rating === null || !outcome) && (
                  <p className={styles.why} role="status">
                    {missing}
                  </p>
                )}
                <button
                  className={styles.primaryBtn}
                  type="button"
                  onClick={submitDetails}
                  disabled={isPending || rating === null || !outcome}
                  // The reason the button is dead, for somebody who cannot see
                  // that it is greyed.
                  aria-describedby={
                    rating === null || !outcome ? "trial-feedback-why" : undefined
                  }
                >
                  {isPending ? "Sending…" : "Submit"}
                </button>
                <span id="trial-feedback-why" className={styles.srOnly}>
                  {rating === null || !outcome ? missing : ""}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
