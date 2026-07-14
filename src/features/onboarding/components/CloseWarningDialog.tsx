"use client"

import { useId } from "react"
import { Icon } from "@iconify/react"
import styles from "./OnboardingModal.module.css"

/**
 * Confirmation shown when the user tries to leave onboarding (backdrop / close /
 * Escape). Two variants:
 *  - mustChooseRole: new users who haven't saved a role can't skip — the only way
 *    out is to pick a role first.
 *  - normal: leaving is allowed but discards the current step's unsaved changes.
 */
export default function CloseWarningDialog({
  mustChooseRole,
  onKeepSetup,
  onSkip,
}: {
  mustChooseRole: boolean
  onKeepSetup: () => void
  onSkip: () => void
}) {
  const titleId = useId()
  const descId = useId()

  return (
    <div className={styles.warningBackdrop}>
      <div
        className={styles.warningCard}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <span className={styles.warningIcon} aria-hidden="true">
          <Icon
            icon={mustChooseRole ? "mdi:shield-account-outline" : "mdi:alert-outline"}
            width={24}
            height={24}
          />
        </span>

        <h2 id={titleId} className={styles.warningTitle}>
          {mustChooseRole ? "Choose a role to continue" : "Finish setting up?"}
        </h2>

        <p id={descId} className={styles.warningText}>
          {mustChooseRole
            ? "You need to choose how you'll use Goatza before you can continue."
            : "Your profile setup isn't finished. Unsaved changes on this step will be discarded."}
        </p>

        <div className={styles.warningActions}>
          {mustChooseRole ? (
            <button
              type="button"
              className={styles.warningPrimary}
              onClick={onKeepSetup}
              autoFocus
            >
              Choose my role
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.warningPrimary}
                onClick={onKeepSetup}
                autoFocus
              >
                Keep setting up
              </button>
              <button
                type="button"
                className={styles.warningGhost}
                onClick={onSkip}
              >
                Skip for now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
