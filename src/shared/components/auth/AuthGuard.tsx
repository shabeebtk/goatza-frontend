"use client"

import { useAuthStore } from "@/store/auth.store"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { authUrlWithNext } from "@/shared/services/authRedirect"
import OnboardingGate from "@/features/onboarding/components/OnboardingGate"
import LegalConsentGate from "@/features/legal/components/LegalConsentGate"
import GuardianGate from "@/features/guardian/components/GuardianGate"

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading, authExitReason } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      // A deliberate sign-out must NOT remember where it happened. useLogout
      // pushes /auth itself and this effect races it; capturing here would
      // leave /auth?next=/settings behind, and the next person to sign in on
      // this device would land on the previous user's page.
      if (authExitReason === "logout") {
        router.replace("/auth")
        return
      }

      // Everything else — an expired session, a cold load initAuth could not
      // refresh, an emailed or push deep link opened while logged out — is
      // someone who was HEADED somewhere. Send them through /auth and back.
      //
      // The query string is read from window, not useSearchParams(). This is
      // a client component sitting in a layout above statically-prerendered
      // pages, and useSearchParams() there forces a Suspense boundary that
      // can fail `next build`. The redirect only ever happens client-side,
      // inside this effect, so window.location.search is both safe and
      // simpler. authUrlWithNext validates: a blocked path becomes a plain
      // /auth.
      //
      // replace, not push — the page they were bounced off is not somewhere
      // Back should return them to.
      router.replace(authUrlWithNext(`${pathname}${window.location.search}`))
      return
    }
  }, [isAuthenticated, isLoading, authExitReason, pathname, router])

  // prevent flicker
  if (isLoading) return null

  // prevent rendering protected content
  if (!isAuthenticated) return null

  // Onboarding (incl. the mandatory role step for new users) renders as a modal
  // over the app and follows the user everywhere, so no route-level gating is
  // needed — deep-linking around it does nothing.
  // LegalConsentGate sits AFTER onboarding so its backdrop stacks on top (it
  // owns the higher z-index too). If terms go stale mid-onboarding, agreeing
  // is the only thing that can happen first — the server is already refusing
  // every write the remaining steps would make.
  // GuardianGate is FIRST because it is the only one that redirects rather than
  // overlaying: a minor waiting on a parent should be moved off the page before
  // the other two start asking them to pick a role or agree to anything.
  return (
    <>
      <GuardianGate />
      {children}
      <OnboardingGate />
      <LegalConsentGate />
    </>
  )
}
