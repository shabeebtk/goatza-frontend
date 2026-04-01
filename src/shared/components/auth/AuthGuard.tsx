"use client"

import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login") // better than push
    }
  }, [isAuthenticated, isLoading])

  // prevent flicker
  if (isLoading) return null

  // prevent rendering protected content
  if (!isAuthenticated) return null

  return <>{children}</>
}