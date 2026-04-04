"use client"
 
import { useAuthStore } from "@/store/auth.store"
import UserProfile from "@/features/profile/components/UserProfile/UserProfile"
 
export default function MyProfilePage() {
  const user = useAuthStore((s) => s.user)
 
  if (!user?.username) return null
 
  return <UserProfile username={user.username} isOwn />
}
 