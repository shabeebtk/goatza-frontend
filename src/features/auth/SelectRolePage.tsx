"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import PageLoader from "@/shared/components/ui/PageLoader/PageLoader"

/**
 * Retired route. Role selection is now the first step of the post-signup onboarding
 * modal (rendered over /home by OnboardingGate), so this page only redirects any
 * old links/bookmarks back into the app.
 *
 * THE GOOGLE AGE GATE IS NOT HERE. It lives beside the role and consent
 * controls that moved out of this file, in
 * `features/onboarding/steps/RoleStep.tsx` — the step a new Google user cannot
 * skip, and the only place the OAuth flow ever asks them anything. Adding the
 * date-of-birth and country fields to this component would render them to
 * nobody: everything below is a redirect.
 */
export default function SelectRolePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/home")
  }, [router])

  return <PageLoader label="Redirecting…" />
}
