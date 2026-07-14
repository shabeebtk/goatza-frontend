"use client"

import { useEffect, useRef, useState } from "react"
import { Icon } from "@iconify/react"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import { useFocusTrap } from "../hooks/useFocusTrap"
import RoleStep from "../steps/RoleStep"
import IdentityStep from "../steps/IdentityStep"
import SportsStep from "../steps/SportsStep"
import DetailsStep from "../steps/DetailsStep"
import PreviewStep from "../steps/PreviewStep"
import SuccessStep from "../steps/SuccessStep"
import CloseWarningDialog from "./CloseWarningDialog"
import styles from "./OnboardingModal.module.css"

/**
 * The onboarding shell: fullscreen sheet on mobile, centered card on desktop.
 * Owns the step chrome (progress, Back, close), focus trap, Escape → close-warning
 * handling, and step announcements. Individual steps own their own content and
 * primary actions. Mounting/gating is decided by OnboardingGate.
 */
export default function OnboardingModal() {
  const user = useAuthStore((s) => s.user)

  const stepIndex = useOnboardingStore((s) => s.stepIndex)
  const steps = useOnboardingStore((s) => s.steps())
  const next = useOnboardingStore((s) => s.next)
  const back = useOnboardingStore((s) => s.back)
  const dismiss = useOnboardingStore((s) => s.dismiss)
  const finish = useOnboardingStore((s) => s.finish)

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)]

  const [showWarning, setShowWarning] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(containerRef, true)

  // New users who haven't saved a role yet cannot skip out of onboarding.
  const mustChooseRole = user?.is_role_confirmed === false

  // Lock body scroll while the modal is up.
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  // Escape opens the close-warning (or dismisses the warning if already open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Defer to a nested editor (e.g. the photo cropper) that owns Escape itself.
      if (useOnboardingStore.getState().nestedOpen) return
      e.stopPropagation()
      if (showWarning) setShowWarning(false)
      else requestClose()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWarning])

  const requestClose = () => {
    // On Success onboarding is already complete — just close, no warning.
    if (currentStep === "success") {
      finish()
      return
    }
    setShowWarning(true)
  }

  const handleKeepSetup = () => setShowWarning(false)

  const handleSkip = () => {
    setShowWarning(false)
    dismiss()
  }

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) requestClose()
  }

  // No going back from Success — onboarding is already complete by then.
  const canGoBack = stepIndex > 0 && currentStep !== "success"
  const totalForCount = steps.length
  const stepNumber = Math.min(stepIndex + 1, totalForCount)

  const renderStep = () => {
    switch (currentStep) {
      case "role":
        return <RoleStep onNext={next} />
      case "identity":
        return <IdentityStep onNext={next} />
      case "sports":
        return <SportsStep onNext={next} />
      case "details":
        return <DetailsStep onNext={next} />
      case "preview":
        return <PreviewStep onNext={next} />
      case "success":
        return <SuccessStep />
      default:
        return null
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Set up your profile"
    >
      <div className={styles.modal} ref={containerRef}>
        {/* ── Header: progress + back + close ── */}
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={back}
            aria-label="Go back"
            data-hidden={!canGoBack}
          >
            <Icon icon="mdi:arrow-left" width={20} height={20} />
          </button>

          <div
            className={styles.progress}
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalForCount}
            aria-valuenow={stepNumber}
            aria-label={`Step ${stepNumber} of ${totalForCount}`}
          >
            {steps.map((id, i) => (
              <span
                key={id}
                className={`${styles.progressSeg} ${
                  i <= stepIndex ? styles.progressSegOn : ""
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={requestClose}
            aria-label="Close"
          >
            <Icon icon="mdi:close" width={20} height={20} />
          </button>
        </div>

        {/* Politely announce step changes to assistive tech. */}
        <p className={styles.srOnly} aria-live="polite">
          {`Step ${stepNumber} of ${totalForCount}`}
        </p>

        {/* ── Current step ── */}
        <div className={styles.content}>{renderStep()}</div>

        {/* ── Close warning ── */}
        {showWarning && (
          <CloseWarningDialog
            mustChooseRole={mustChooseRole}
            onKeepSetup={handleKeepSetup}
            onSkip={handleSkip}
          />
        )}
      </div>
    </div>
  )
}
