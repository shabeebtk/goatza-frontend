// app/organization/profile/[username]/page.tsx
"use client"
import { use } from "react"
import { useAuthStore } from "@/store/auth.store"
import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"


export default function OrgProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const me = useAuthStore((s) => s.user)
  // orgs owned by the user would need a check against org.owner_id or similar
  // pass isOwn=false here; admin page uses orgId + isOwn=true
  return <OrgProfile username={username} isOwn={false} />
}