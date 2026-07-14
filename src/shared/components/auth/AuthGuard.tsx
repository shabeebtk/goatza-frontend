"use client"

import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const router = useRouter()

  // OAuth users who signed up without choosing a role must finish onboarding
  // before they can reach any protected area (closes the deep-link bypass).
  const needsRole = isAuthenticated && user?.is_role_confirmed === false

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.replace("/auth")
      return
    }

    if (needsRole) {
      router.replace("/auth/select-role")
    }
  }, [isAuthenticated, isLoading, needsRole])

  // prevent flicker
  if (isLoading) return null

  // prevent rendering protected content
  if (!isAuthenticated) return null

  // unconfirmed users are being redirected to role selection — don't flash the app
  if (needsRole) return null

  return <>{children}</>
}