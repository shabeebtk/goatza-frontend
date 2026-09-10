"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGoogleAuth } from "@/features/auth/hooks/useAuthMutations"
import PageLoader from "@/shared/components/ui/PageLoader/PageLoader"
import { takeOAuthNext } from "@/shared/services/authRedirect"

export default function ClientGoogleCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const googleAuth = useGoogleAuth()

  const hasRun = useRef(false) // ✅ guard

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      router.replace("/auth")
      return
    }

    googleAuth.mutate(
      { code, state },
      {
        /*
          NO GUARDIAN BRANCH HERE, deliberately.

          A Google account is created without anyone being asked anything — no
          birthdate — so at this moment the server cannot tell whether it
          belongs to a minor, and the callback response carries no
          `guardian_required`. The assessment happens one step later, at the
          role step (POST /user/role), which is the first time a birthdate is
          on file and the one step a new Google user cannot skip.

          Onboarding is a modal that follows the user everywhere, so landing on
          /home does not skip it; RoleStep is what raises the parent screen.
        */
        onSuccess: () => router.replace(takeOAuthNext()),
        onError: () => router.replace("/auth"),
      }
    )
  }, []) 

  return <PageLoader label="Signing you in..." />
}