"use client"
import UserProfile from "@/features/profile/components/UserProfile/UserProfile"

export default function PublicProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const { username } = params
  return <UserProfile username={username} />
}