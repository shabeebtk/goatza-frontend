// ─────────────────────────────────────────────────────────────
// Public profile — view-only for other users
// ─────────────────────────────────────────────────────────────

"use client"

import { use } from "react"
import { useAuthStore } from "@/store/auth.store"
import UserProfile from "@/features/profile/components/UserProfile/UserProfile"

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const me = useAuthStore((s) => s.user)
  const isOwn = me?.username === username

  return <UserProfile username={username} isOwn={isOwn} />
}