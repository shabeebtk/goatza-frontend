"use client"

import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function HomePage() {
  const { user, isAuthenticated, isLoading, clearAuth } = useAuthStore()
  const router = useRouter()

  if (!user) return <div>No user</div>

  return (
    <div style={{ padding: 20 }}>
      <h2>Home</h2>

      <p>Welcome: {user.username}</p>
      <p>Email: {user.email}</p>

      <button
        onClick={async () => {
          try {
            await logoutApi() 
          } catch (e) { }

          clearAuth()
          router.push("/login")
        }}
      >
        Logout
      </button>
    </div>
  )
}