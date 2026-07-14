"use client"

import { useState } from "react"
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
      await setRoleMutation.mutateAsync(role)
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
          disabled={!role}
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

      {apiError && (
        <p className={styles.apiError} role="alert">
          <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
          {apiError}
        </p>
      )}
    </StepScaffold>
  )
}
