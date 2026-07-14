"use client"

import { useState, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import { Icon } from "@iconify/react"
import { Button } from "@/shared/components/ui"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import { useCompleteOnboarding } from "../hooks/useCompleteOnboarding"
import { pickSuccessMessage } from "../constants/messages"
import StepScaffold from "./StepScaffold"
import modal from "../components/OnboardingModal.module.css"
import styles from "./SuccessStep.module.css"

// Deterministic confetti burst (index-based — no random, no hydration mismatch).
const CONFETTI_COLORS = ["#00B562", "#FFC94D", "#4D9BFF", "#FF6B6B"]
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  const dist = 66 + (i % 3) * 20
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
    rot: `${(i % 2 ? 1 : -1) * (160 + i * 14)}deg`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${i * 32}ms`,
  }
})

/**
 * Terminal step. Welcomes the user by first name, shows a random motivational line,
 * and a CSS-only celebration. "Go to your feed" ensures onboarding is complete
 * (idempotent), tears down the modal, and heads to the feed.
 */
export default function SuccessStep() {
  const router = useRouter()
  const userName = useAuthStore((s) => s.user?.name)
  const finish = useOnboardingStore((s) => s.finish)
  const completeOnboarding = useCompleteOnboarding()
  const [apiError, setApiError] = useState<string | null>(null)

  const firstName = userName?.trim().split(/\s+/)[0] ?? ""

  // Pick the message once per mount (not on every render).
  const [message] = useState(() => pickSuccessMessage(Math.random()))

  const handleGoToFeed = async () => {
    setApiError(null)
    try {
      // Idempotent: safe even when already completed earlier in the flow.
      await completeOnboarding.mutateAsync()
      finish()
      router.push("/home")
    } catch {
      setApiError("Couldn't finish setup. Please try again.")
    }
  }

  return (
    <StepScaffold
      icon="mdi:check-decagram-outline"
      title={firstName ? `You're all set, ${firstName}!` : "You're all set!"}
      subtitle={message}
      footer={
        <Button
          variant="brand"
          size="lg"
          fullWidth
          loading={completeOnboarding.isPending}
          onClick={handleGoToFeed}
        >
          Go to your feed →
        </Button>
      }
    >
      <div className={styles.celebrate}>
        <span className={styles.ring} aria-hidden="true" />
        <div className={styles.confettiWrap} aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={styles.confetti}
              style={
                {
                  background: c.color,
                  "--dx": c.dx,
                  "--dy": c.dy,
                  "--rot": c.rot,
                  "--delay": c.delay,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <span className={styles.badge}>
          <Icon icon="mdi:check-bold" width={34} height={34} />
        </span>
      </div>

      {apiError && (
        <p className={modal.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}
    </StepScaffold>
  )
}
