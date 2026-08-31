"use client"

import { useState } from "react"
import Link from "next/link"
import { Icon } from "@iconify/react"
import { Button } from "@/shared/components/ui"
import RoleSelect from "@/features/auth/components/RoleSelect/RoleSelect"
import { useSetRole } from "@/features/auth/hooks/useAuthMutations"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import type { UserRole } from "@/shared/constants/roles"
import StepScaffold from "./StepScaffold"
import styles from "../components/OnboardingModal.module.css"

/**
 * Step 1 — Role. Prefilled from the user's current role. "Continue" only hits the
 * API when the role actually changed or was never confirmed (new Google users);
 * otherwise it just advances. Selecting a role also sets the branch (player → full
 * flow, others → identity then done).
 */
export default function RoleStep({ onNext }: { onNext: () => void }) {
  const user = useAuthStore((s) => s.user)
  const setRoleMutation = useSetRole()

  const role = useOnboardingStore((s) => s.role)
  const setStoreRole = useOnboardingStore((s) => s.setRole)

  const [apiError, setApiError] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  /**
   * A brand-new Google account, and the only kind of user who reaches this
   * step without having agreed to anything.
   *
   * Email signups tick the box on the form and arrive with consent already on
   * file; is_role_confirmed is true for them because they chose a role there.
   * A Google account is created with is_role_confirmed FALSE and nothing
   * accepted — the button they pressed was on Google's screen, not ours — so
   * this step, which they cannot skip, is where they are actually asked.
   */
  const needsConsent = user?.is_role_confirmed === false

  const handleChange = (next: UserRole) => {
    setApiError(null)
    setStoreRole(next)
  }

  const handleContinue = async () => {
    if (!role) return
    setApiError(null)

    // New Google users (is_role_confirmed === false) must persist a role; everyone
    // else only needs the API call when they actually changed it.
    const mustSave = user?.is_role_confirmed === false || role !== user?.role

    if (!mustSave) {
      onNext()
      return
    }

    try {
      await setRoleMutation.mutateAsync({
        role,
        // Only sent when this user still owes consent. The backend requires it
        // in exactly that case and ignores it otherwise, so an existing user
        // changing role mid-onboarding is unaffected.
        acceptedTerms: needsConsent ? acceptedTerms : undefined,
      })
      onNext()
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Couldn't save your role. Please try again."
      setApiError(msg)
    }
  }

  return (
    <StepScaffold
      icon="mdi:account-star-outline"
      title="How will you use Goatza?"
      subtitle="Pick the role that fits you best — you can build out your profile next."
      footer={
        <Button
          variant="brand"
          size="lg"
          fullWidth
          disabled={!role || (needsConsent && !acceptedTerms)}
          loading={setRoleMutation.isPending}
          onClick={handleContinue}
        >
          Continue →
        </Button>
      }
    >
      <RoleSelect
        value={role}
        onChange={handleChange}
        disabled={setRoleMutation.isPending}
      />

      {needsConsent && (
        <div className={styles.consentField}>
          <label className={styles.consentLabel}>
            <input
              type="checkbox"
              className={styles.consentBox}
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              disabled={setRoleMutation.isPending}
            />
            <span className={styles.consentText}>
              I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.consentLink}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.consentLink}
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </div>
      )}

      {apiError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}
    </StepScaffold>
  )
}
