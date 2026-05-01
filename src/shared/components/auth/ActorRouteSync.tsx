"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useAuthStore } from "@/store/auth.store"
import { useOrganizations } from "@/features/organization/hooks/useOrganizations"

export default function ActorRouteSync() {
  const pathname = usePathname()
  const { data: organizations } = useOrganizations()

  const syncActorFromPath = useAuthStore((s) => s.syncActorFromPath)
  const setOrganizations = useAuthStore((s) => s.setOrganizations)

  useEffect(() => {
    if (!pathname) return
    syncActorFromPath(pathname)
  }, [pathname, syncActorFromPath])

  useEffect(() => {
    if (!organizations) return
    setOrganizations(organizations)
  }, [organizations, setOrganizations])

  return null
}
