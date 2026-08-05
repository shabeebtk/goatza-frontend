"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth.store"

export default function LandingGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/home")
  }, [isAuthenticated, isLoading, router])

  if (isLoading) return null          // brief blank beats a landing flash
  if (isAuthenticated) return null    // redirecting
  return <>{children}</>
}
