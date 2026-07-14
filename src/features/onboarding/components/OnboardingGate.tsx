"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/store/auth.store"
import { useOnboardingStore } from "../store/onboarding.store"
import OnboardingModal from "./OnboardingModal"

/**
 * Decides whether onboarding is showing, and follows the user everywhere in the
 * authenticated app (so deep-linking around it does nothing). Mounted once inside
 * AuthGuard.
 *
 * Opens (start → active) when authenticated AND (role not yet confirmed OR
 * onboarding not finished) AND the session dismiss flag isn't set. Once open, the
 * `active` flag — not the auth flags — keeps it mounted, so the Success screen can
 * still show after is_onboarding_completed flips to true. Skipping or the Success
 * CTA clears `active`.
 */
export default function OnboardingGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const user = useAuthStore((s) => s.user)

  const active = useOnboardingStore((s) => s.active)
  const dismissed = useOnboardingStore((s) => s.dismissed)
  const hydrateDismissed = useOnboardingStore((s) => s.hydrateDismissed)
  const start = useOnboardingStore((s) => s.start)

  // Pull the "Skip for now" flag out of sessionStorage once, into reactive state.
  useEffect(() => {
    hydrateDismissed()
  }, [hydrateDismissed])

  const needsOnboarding =
    !isLoading &&
    isAuthenticated &&
    !!user &&
    (user.is_role_confirmed === false ||
      user.is_onboarding_completed === false)

  // Open the flow the first time it's needed. Guarding on `!active` (which lives in
  // the module-level store) means navigating between route groups — which remounts
  // this gate — won't restart onboarding or reset progress.
  useEffect(() => {
    if (needsOnboarding && !dismissed && !active) {
      start(user?.role ?? null)
    }
  }, [needsOnboarding, dismissed, active, user?.role, start])

  if (!active || dismissed) return null

  return <OnboardingModal />
}
