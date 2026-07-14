"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/shared/components/ui"
import { Icon } from "@iconify/react"
import RoleSelect from "@/features/auth/components/RoleSelect/RoleSelect"
import { useSetRole } from "@/features/auth/hooks/useAuthMutations"
import { useAuthStore } from "@/store/auth.store"
import type { UserRole } from "@/shared/constants/roles"
import { LOGO_URL } from "@/constants"
import styles from "./SelectRolePage.module.css"

/**
 * Post-Google onboarding: new OAuth users land here (is_role_confirmed === false)
 * to pick their role exactly once before entering the app.
 */
export default function SelectRolePage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  const [role, setRole] = useState<UserRole | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const setRoleMutation = useSetRole()

  // Only unconfirmed, authenticated users belong here. Wait for auth bootstrap
  // (isLoading) before deciding, then redirect everyone else out.
  const needsRole = isAuthenticated && user?.is_role_confirmed === false

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace("/auth")
      return
    }
    if (user?.is_role_confirmed !== false) {
      router.replace("/home")
    }
  }, [isLoading, isAuthenticated, user?.is_role_confirmed, router])

  const handleContinue = async () => {
    if (!role) return
    setApiError(null)
    try {
      await setRoleMutation.mutateAsync(role)
      router.replace("/home")
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Couldn't save your role. Please try again."
      setApiError(msg)
    }
  }

  // Prevent flicker while bootstrapping or before a guard redirect fires.
  if (isLoading || !needsRole) return null

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.logoLink} aria-label="Goatza home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_URL}
          alt=""
          aria-hidden="true"
          className={styles.logoImg}
          onError={(e) => {
            e.currentTarget.style.display = "none"
          }}
        />
      </Link>

      <div className={styles.card}>
        <p className={styles.heading}>How will you use Goatza?</p>
        <p className={styles.subtitle}>
          Pick the role that fits you best — you can build out your profile next.
        </p>

        <RoleSelect
          value={role}
          onChange={setRole}
          disabled={setRoleMutation.isPending}
        />

        {apiError && (
          <p className={styles.apiError} role="alert">
            <Icon icon="mdi:alert-circle-outline" width={15} height={15} />
            {apiError}
          </p>
        )}

        <Button
          variant="brand"
          size="lg"
          fullWidth
          disabled={!role}
          loading={setRoleMutation.isPending}
          onClick={handleContinue}
          style={{ marginTop: "var(--space-4)" }}
        >
          Continue →
        </Button>
      </div>
    </div>
  )
}
