"use client"

import { useEffect } from "react"

import { useAuthStore } from "@/store/auth.store"
import { useLegalConsentStore } from "../store/legalConsent.store"
import LegalConsentModal from "./LegalConsentModal/LegalConsentModal"

/**
 * Decides whether the re-consent modal is up. Mounted once inside AuthGuard,
 * beside OnboardingGate, so it follows the user everywhere in the app and
 * deep-linking around it does nothing.
 *
 * TWO WAYS IN, ONE MODAL:
 *
 *   1. SESSION START — `legal.pending_documents` arrives on the user from GET
 *      /user/details (initAuth calls it on every boot). That is this effect.
 *   2. MID-SESSION — a version bumps under a signed-in user, and the next
 *      write comes back 403 TERMS_ACCEPTANCE_REQUIRED. The axios interceptor
 *      pushes that into the same store (core/api/axios.ts).
 *
 * The second is not a nicety. A long-lived PWA session can outlast a deploy by
 * days, and without it those users would meet a version bump as writes that
 * silently fail.
 *
 * Note `legal` is optional on the user: the login, OTP and Google responses
 * serialise a user WITHOUT it (they come from UserSerializer, not
 * /user/details). A missing block means "not known", which is not the same as
 * "nothing pending" — so this asks for nothing, and route 2 covers the gap the
 * moment the user tries to write.
 */
export default function LegalConsentGate() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const pendingFromUser = useAuthStore((s) => s.user?.legal?.pending_documents)

  const open = useLegalConsentStore((s) => s.open)
  const require = useLegalConsentStore((s) => s.require)
  const clear = useLegalConsentStore((s) => s.clear)

  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    if (!pendingFromUser || pendingFromUser.length === 0) return

    require(pendingFromUser)
  }, [isLoading, isAuthenticated, pendingFromUser, require])

  // A session ending takes the modal with it — otherwise "Log out" from inside
  // the modal would leave it hanging over the auth page.
  useEffect(() => {
    if (!isAuthenticated && open) clear()
  }, [isAuthenticated, open, clear])

  if (!open || !isAuthenticated) return null

  return <LegalConsentModal />
}
