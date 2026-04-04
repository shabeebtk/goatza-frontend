"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth.store"

export default function MyProfilePage() {
  const router     = useRouter()
  const username   = useAuthStore((s) => s.user?.username)
  const isLoading  = useAuthStore((s) => s.isLoading)

  useEffect(() => {
    // Wait until the auth state has finished loading before redirecting
    if (!isLoading && username) {
      router.replace(`/profile/${username}`)
    }
  }, [isLoading, username, router])

  // Render nothing while auth loads / redirecting
  return null
}