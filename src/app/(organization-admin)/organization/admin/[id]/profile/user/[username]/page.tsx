"use client"
import { use } from "react"
import UserProfile from "@/features/profile/components/UserProfile/UserProfile"

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  return <UserProfile username={username} />
}