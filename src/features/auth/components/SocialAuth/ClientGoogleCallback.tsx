"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useGoogleAuth } from "@/features/auth/hooks/useAuthMutations"

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

    console.log("code:", code)
    console.log("state:", state)

    if (!code || !state) {
      router.replace("/auth")
      return
    }

    googleAuth.mutate(
      { code, state },
      {
        onSuccess: () => router.replace("/home"),
        onError: () => router.replace("/auth"),
      }
    )
  }, []) 

  return <div>Signing you in...</div>
}