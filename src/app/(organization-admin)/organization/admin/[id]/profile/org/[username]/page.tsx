"use client"

import { use } from "react"
import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"
import { useAuthStore } from "@/store/auth.store"

export default function OrgProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  const actorType = useAuthStore((s) => s.actorType)
  const currentOrg = useAuthStore((s) => s.currentOrganization)

  // Check ownership
  const isOwn =
    actorType === "organization" &&
    currentOrg?.username === username

  return <OrgProfile username={username} isOwn={isOwn} />
}