"use client"

import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { logoutApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"

/**
 * The app's single logout path: retire the refresh cookie server-side, drop the
 * in-memory session, empty the React Query cache (it is scoped to the actor that
 * just left), then land on the auth screen.
 *
 * The API call is best-effort — an offline or already-dead session must still
 * log out locally, so a failure there never blocks the rest.
 */
export function useLogout() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((state) => state.clearAuth)

  return async () => {
    try {
      await logoutApi()
    } catch {}
    clearAuth()
    queryClient.clear()
    router.push("/auth")
  }
}
