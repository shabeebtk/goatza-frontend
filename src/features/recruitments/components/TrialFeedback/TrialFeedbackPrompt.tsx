"use client"

/**
 * TrialFeedbackPrompt — the one place the trial-feedback ask is rendered, and
 * the one place it decides whether to render at all. Mounted on the
 * application card and on the recruitment detail, so both get the same row,
 * the same suppression and the same sheet.
 *
 * WHEN IT ASKS is the server's answer, not ours. `can_give_feedback` already
 * means "right status, trial over, not answered yet" and
 * `feedback_window_open` bounds the ask to 30 days after the trial. This
 * component re-derives NONE of it from dates or statuses: a client rule that
 * drifts from the server's is how you ship a prompt that 400s on tap.
 *
 * THREE STATES, and it renders at most one:
 *
 *   answered   → a quiet summary of what they said, plus Edit
 *   askable    → the prompt row, unless dismissed in the last 7 days
 *   otherwise  → nothing
 *
 * NOT A BANNER. No amber, no red, no icon shouting at them: nothing here is
 * wrong and nobody is late. It is a calm row that happens to be tappable, and
 * the × means a player who does not want to answer can make it go away
 * without feeling nagged.
 */

import { useState } from "react"
import { Icon } from "@iconify/react"

import {
  isDismissed,
  readDismissals,
  writeDismissal,
} from "../../feedbackDismissal"
import StarRating from "../StarRating/StarRating"
import TrialFeedbackSheet from "./TrialFeedbackSheet"
import type { TrialSelfReport, TrialFeedbackEligibility } from "../../services/recruitments.api"
import styles from "./TrialFeedbackPrompt.module.css"

const OUTCOME_SAID: Record<string, string> = {
  selected: "selected",
  not_selected: "not selected",
  waiting: "still waiting",
}

type TrialFeedbackPromptProps = {
  applicationId: string
  /** The player's own answers + the server's two eligibility flags. */
  application: TrialSelfReport & TrialFeedbackEligibility
  /** Invalidated on submit, and named in the privacy line. */
  recruitmentId?: string
  orgName?: string
  /** A short line under the question — the city and date, for context. */
  subtitle?: string | null
  className?: string
}

export default function TrialFeedbackPrompt({
  applicationId,
  application,
  recruitmentId,
  orgName,
  subtitle,
  className = "",
}: TrialFeedbackPromptProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  // Read ONCE per mount, not on every render: a re-render mid-session must not
  // re-check storage and make the row flicker. Lazy so the read (which can
  // throw) never runs during SSR.
  const [dismissals, setDismissals] = useState(() => readDismissals())

  const answered = !!application.feedback_at
  const askable =
    !!application.can_give_feedback && application.feedback_window_open !== false

  // ── Answered: show it back, quietly ─────────────────────────
  // This is also the resubmit path. A player who said "still waiting" WILL
  // come back when they hear, and that update is the answer the org most
  // wants — so Edit is always here, not just while some window is open.
  if (answered) {
    const attended = application.attended_self_reported
    const outcome = application.outcome_self_reported || ""
    const rating = application.trial_rating ?? null

    return (
      <>
        <div className={`${styles.said} ${className}`}>
          <span className={styles.saidText}>
            {attended === false ? (
              <>You said you couldn&apos;t make it</>
            ) : (
              <>
                You said: <strong>{OUTCOME_SAID[outcome] ?? "you attended"}</strong>
                {rating !== null && (
                  <>
                    {" · "}
                    <StarRating
                      value={rating}
                      label={`You rated this ${rating} out of 5`}
                      size="sm"
                      hideWord
                    />
                  </>
                )}
              </>
            )}
          </span>
          <button
            className={styles.editBtn}
            type="button"
            onClick={() => setSheetOpen(true)}
          >
            Edit
          </button>
        </div>

        {sheetOpen && (
          <TrialFeedbackSheet
            applicationId={applicationId}
            recruitmentId={recruitmentId}
            orgName={orgName}
            // Prefilled, and the sheet skips step 1 from these: somebody
            // correcting "waiting" to "selected" must not be asked again
            // whether they went.
            initialOutcome={outcome}
            initialRating={rating}
            initialFeedback={application.trial_feedback ?? ""}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </>
    )
  }

  if (!askable) return null
  if (isDismissed(dismissals, applicationId)) return null

  const dismiss = () => {
    writeDismissal(applicationId)
    // Re-read rather than patching local state by hand, so what is on screen
    // is what storage actually holds — including the case where the write
    // silently failed and the row should stay.
    setDismissals(readDismissals())
  }

  return (
    <>
      {/* THE WHOLE ROW IS THE CONTROL. A <button> wrapping the text, with the
          dismiss as a sibling rather than a child — nesting it would make one
          button inside another, which is invalid and unpredictable to click. */}
      <div className={`${styles.prompt} ${className}`}>
        <button
          className={styles.promptMain}
          type="button"
          onClick={() => setSheetOpen(true)}
        >
          <span className={styles.promptText}>
            <span className={styles.promptTitle}>How did the trial go?</span>
            {subtitle && <span className={styles.promptSub}>{subtitle}</span>}
          </span>
          <span className={styles.promptCta} aria-hidden="true">
            Tell us
          </span>
        </button>

        <button
          className={styles.dismissBtn}
          type="button"
          onClick={dismiss}
          aria-label="Not now — hide this for a week"
          title="Not now"
        >
          <Icon icon="mdi:close" width={16} height={16} />
        </button>
      </div>

      {sheetOpen && (
        <TrialFeedbackSheet
          applicationId={applicationId}
          recruitmentId={recruitmentId}
          orgName={orgName}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}
