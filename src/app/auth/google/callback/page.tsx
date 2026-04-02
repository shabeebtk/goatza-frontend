"use client"
export const dynamic = "force-dynamic"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGoogleAuth } from "@/features/auth/hooks/useAuthMutations"

export default function GoogleCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const googleAuth = useGoogleAuth()

  useEffect(() => {
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      router.replace("/auth")
      return
    }

    googleAuth.mutate(
      { code, state },
      {
        onSuccess: () => {
          router.replace("/profile")  // redirect after login.
        },
        onError: () => {
          router.replace("/auth")
        },
      }
    )
  }, [])

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      Signing you in...
    </div>
  )
}