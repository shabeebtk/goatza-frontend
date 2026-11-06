"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useAuthStore } from "@/store/auth.store"

/**
 * The match diary belongs to a player acting as themselves. The server already
 * refuses everyone else; this keeps them off a page that could only show 403s.
 *
 * Waits for the session before deciding: a role that has not loaded yet is not a
 * coach, and bouncing a player to /home on a cold start would lose their place.
 */
export default function PlayersOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const isLoading = useAuthStore((s) => s.isLoading)
  const role = useAuthStore((s) => s.user?.role)
  const actorType = useAuthStore((s) => s.actorType)

  const settled = !isLoading && Boolean(role)
  const allowed = role === "player" && actorType === "user"

  useEffect(() => {
    if (settled && !allowed) router.replace("/home")
  }, [settled, allowed, router])

  return allowed ? <>{children}</> : null
}
