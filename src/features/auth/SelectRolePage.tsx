"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import PageLoader from "@/shared/components/ui/PageLoader/PageLoader"

/**
 * Retired route. Role selection is now the first step of the post-signup onboarding
 * modal (rendered over /home by OnboardingGate), so this page only redirects any
 * old links/bookmarks back into the app.
 */
export default function SelectRolePage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/home")
  }, [router])

  return <PageLoader label="Redirecting…" />
}
