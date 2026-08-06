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
        // Onboarding (incl. the mandatory role step for new Google users) is a
        // modal that follows the user everywhere, so landing somewhere other
        // than /home does not skip it. takeOAuthNext returns /home unless the
        // flow was started from a login wall that recorded a destination.
        onSuccess: () => router.replace(takeOAuthNext()),
        onError: () => router.replace("/auth"),
      }
    )
  }, []) 

  return <PageLoader label="Signing you in..." />
}