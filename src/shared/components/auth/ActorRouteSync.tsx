"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth.store"

export default function ActorRouteSync() {
  const pathname = usePathname()

  const switchToUser = useAuthStore((s) => s.switchToUser)
  const switchToOrganization = useAuthStore(
    (s) => s.switchToOrganization
  )

  useEffect(() => {
    if (!pathname) return

    // Match org admin route
    const match = pathname.match(
      /^\/organization\/admin\/([^/]+)/
    )

    if (match?.[1]) {
      const orgId = match[1]
      switchToOrganization(orgId)
      return
    }

    // all other authenticated routes = user
    switchToUser()
  }, [pathname, switchToOrganization, switchToUser])

  return null
}