"use client"

/**
 * The ONE report sheet every entry point opens — profile ⋯, post ⋯, comment ⋯,
 * message long-press, recruitment ⋯. Same reasoning as BlockConfirmSheet: one
 * component so the categories and the copy cannot drift between six menus.
 *
 * Three steps in one sheet, never three sheets:
 *
 *   1. CATEGORY — a radio list. Picking one advances immediately; there is no
 *      "Next" button, because a single-choice list with a confirm button is one
 *      tap of ceremony for no decision.
 *   2. DETAILS  — optional free text. Skippable, and says so.
 *   3. DONE     — the thank-you, plus the one-tap "Block @handle" shortcut,
 *      because the person who just reported someone very often wants them gone
 *      from their feed too, and making them find the profile menu for it is
 *      how that second step never happens.
 *
 * "Already received" (a duplicate report) lands on the SAME done step. The
 * reporter is not told their report was a duplicate — it changes nothing they
 * can act on and reads as a rejection of something they were right to send.
 *
 * The block shortcut hands off to BlockConfirmSheet rather than calling the
 * block mutation directly: blocking has its own confirmation copy ("they won't
 * be notified") that is the whole reason people feel safe pressing it, and a
 * silent block fired from a report sheet would skip it.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Icon } from "@iconify/react"

import { useReport } from "../../hooks/useModerationQueries"
import { REPORT_CATEGORIES, REPORT_TARGET_NOUN } from "../../reportMeta"
import type {
  BlockTargetType,
  ReportCategory,
  ReportTargetType,
} from "../../services/moderation.api"
import BlockConfirmSheet from "../BlockConfirmSheet/BlockConfirmSheet"
import styles from "./ReportSheet.module.css"

/**
 * The ACCOUNT behind the reported thing, when there is one to block.
 *
 * Separate from the report target on purpose: you report a post but you block
 * its author, and for a profile report the two happen to be the same identity.
 * Omitted entirely — by a caller with no author to hand, or one that already
 * knows the pair is blocked — simply hides the shortcut.
 */
export interface ReportBlockTarget {
  type: BlockTargetType
  id: string
  username: string
  name?: string
}

export interface ReportSheetProps {
  targetType: ReportTargetType
  targetId: string
  /** Handle of whoever the report is about — heading copy only. */
  username?: string
  /** The account the "Block" shortcut acts on. Omit to hide the shortcut. */
  blockTarget?: ReportBlockTarget
  onClose: () => void
}

type Step = "category" | "details" | "done"

const MAX_DETAILS = 2000

export default function ReportSheet({
  targetType,
  targetId,
  username,
  blockTarget,
  onClose,
}: ReportSheetProps) {
  const report = useReport()
  const backdropRef = useRef<HTMLDivElement>(null)
  const detailsRef = useRef<HTMLTextAreaElement>(null)

  const [step, setStep] = useState<Step>("category")
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [details, setDetails] = useState("")
  const [blockOpen, setBlockOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const noun = REPORT_TARGET_NOUN[targetType]

  // Lock body scroll while open — same as BlockConfirmSheet / PostOptionsSheet.
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

  // Focus the textarea when step 2 opens, so a caller who wants to type does
  // not have to reach for it. Not on mobile keyboards' behalf — the sheet is
  // already at the bottom edge and the field is the only control on it.
  useEffect(() => {
    if (step === "details") detailsRef.current?.focus()
  }, [step])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const pickCategory = (value: ReportCategory) => {
    setCategory(value)
    setStep("details")
  }

  const submit = () => {
    if (!category) return

    report.mutate(
      {
        target_type: targetType,
        target_id: targetId,
        category,
        // Only sent when there is something to send — an empty string would
        // overwrite nothing but still travel.
        ...(details.trim() ? { details: details.trim() } : {}),
      },
      {
        // The duplicate case ("already received") comes back as a SUCCESS, so
        // there is nothing to branch on here — both land on the thank-you.
        onSuccess: () => setStep("done"),
        // On failure the sheet stays on step 2 with the error toast over it,
        // so Submit is still one tap away rather than needing the whole menu
        // journey again. Same rule BlockConfirmSheet follows.
      }
    )
  }

  const selectedLabel = useMemo(
    () => REPORT_CATEGORIES.find((c) => c.value === category)?.label ?? "",
    [category]
  )

  const canBlock = Boolean(blockTarget) && !blocked

  return createPortal(
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sheet-title"
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />

        {/* ── Step 1: category ── */}
        {step === "category" && (
          <>
            <header className={styles.header}>
              <h3 id="report-sheet-title" className={styles.title}>
                Report {noun}
              </h3>
              <p className={styles.subtitle}>
                {username
                  ? `Why are you reporting @${username}'s ${noun}?`
                  : `Why are you reporting this ${noun}?`}
              </p>
            </header>

            <div
              className={styles.options}
              role="radiogroup"
              aria-label={`Reason for reporting this ${noun}`}
            >
              {REPORT_CATEGORIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={category === option.value}
                  className={styles.option}
                  onClick={() => pickCategory(option.value)}
                >
                  <span className={styles.radio} aria-hidden="true">
                    {category === option.value && (
                      <span className={styles.radioDot} />
                    )}
                  </span>
                  <span className={styles.optionLabel}>{option.label}</span>
                  <Icon
                    icon="mdi:chevron-right"
                    width={18}
                    height={18}
                    className={styles.optionChevron}
                  />
                </button>
              ))}
            </div>

            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
          </>
        )}

        {/* ── Step 2: optional details ── */}
        {step === "details" && (
          <>
            <header className={styles.header}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setStep("category")}
                aria-label="Back to reasons"
              >
                <Icon icon="mdi:chevron-left" width={20} height={20} />
              </button>
              <h3 id="report-sheet-title" className={styles.title}>
                {selectedLabel}
              </h3>
              <p className={styles.subtitle}>
                Anything else we should know? This is optional.
              </p>
            </header>

            <textarea
              ref={detailsRef}
              className={styles.textarea}
              placeholder="Add details (optional)"
              value={details}
              maxLength={MAX_DETAILS}
              rows={4}
              onChange={(e) => setDetails(e.target.value)}
              disabled={report.isPending}
            />

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={report.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={submit}
                disabled={report.isPending}
              >
                {report.isPending ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Sending…
                  </>
                ) : (
                  "Submit"
                )}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: done ── */}
        {step === "done" && (
          <div className={styles.done}>
            <span className={styles.doneMark} aria-hidden="true">
              <Icon icon="mdi:check" width={26} height={26} />
            </span>

            <h3 id="report-sheet-title" className={styles.title}>
              Thanks — our team will review this.
            </h3>
            <p className={styles.text}>
              We don&apos;t share who reported what.
            </p>

            <div className={styles.doneActions}>
              {canBlock && blockTarget && (
                <button
                  type="button"
                  className={styles.blockBtn}
                  onClick={() => setBlockOpen(true)}
                >
                  <Icon
                    icon="mdi:account-cancel-outline"
                    width={17}
                    height={17}
                  />
                  Block @{blockTarget.username}
                </button>
              )}

              {blocked && (
                <p className={styles.blockedNote}>
                  <Icon icon="mdi:check-circle-outline" width={16} height={16} />
                  Blocked @{blockTarget?.username}
                </p>
              )}

              <button
                type="button"
                className={styles.doneBtn}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* The existing block confirmation, unchanged — it owns the "they won't
          be notified" copy that makes blocking feel safe. */}
      {blockOpen && blockTarget && (
        <BlockConfirmSheet
          targetType={blockTarget.type}
          targetId={blockTarget.id}
          username={blockTarget.username}
          name={blockTarget.name}
          onClose={() => setBlockOpen(false)}
          // Stay on the done step rather than closing: the report sheet is the
          // only thing on screen confirming the report landed, and yanking it
          // away the instant the block succeeds loses that.
          onBlocked={() => setBlocked(true)}
        />
      )}
    </div>,
    document.body
  )
}
