"use client"

import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import OnboardingGate from "@/features/onboarding/components/OnboardingGate"

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.replace("/auth")
      return
    }
  }, [isAuthenticated, isLoading])

  // prevent flicker
  if (isLoading) return null

  // prevent rendering protected content
  if (!isAuthenticated) return null

  // Onboarding (incl. the mandatory role step for new users) renders as a modal
  // over the app and follows the user everywhere, so no route-level gating is
  // needed — deep-linking around it does nothing.
  return (
    <>
      {children}
      <OnboardingGate />
    </>
  )
}
