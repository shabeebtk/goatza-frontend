"use client"

/**
 * RoleGuard — client-side role gate for a route subtree.
 *
 * Route protection here is client-side by necessity: the access token and the
 * user's role live in memory-only Zustand state (never in a cookie), so Next
 * middleware on the server cannot see them. This mirrors the existing AuthGuard
 * / OrgMemberGuard pattern.
 *
 * While the role is still resolving it renders nothing (AuthGuard already blocks
 * unauthenticated access above this), so no wrong content flashes. A user whose
 * role is not in `allow` is redirected to /home.
 */

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth.store"
import type { UserRole } from "@/shared/constants/roles"

interface RoleGuardProps {
  allow: readonly UserRole[]
  children: React.ReactNode
  /** Where to send a disallowed role. Defaults to /home. */
  redirectTo?: string
}

export default function RoleGuard({
  allow,
  children,
  redirectTo = "/home",
}: RoleGuardProps) {
  const role = useAuthStore((state) => state.user?.role)
  const isLoading = useAuthStore((state) => state.isLoading)
  const router = useRouter()

  const isAllowed = !!role && allow.includes(role)

  useEffect(() => {
    if (isLoading) return
    if (!role) return
    if (!isAllowed) {
      router.replace(redirectTo)
    }
  }, [isLoading, role, isAllowed, redirectTo, router])

  // Role unresolved → render nothing (avoid flashing gated content).
  if (isLoading || !role) return null

  // Disallowed → render nothing while the redirect above runs.
  if (!isAllowed) return null

  return <>{children}</>
}
