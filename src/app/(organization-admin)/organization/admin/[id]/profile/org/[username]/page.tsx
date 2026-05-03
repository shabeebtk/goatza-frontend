"use client"

import OrgProfile from "@/features/organization/component/OrganizationProfile/OrganizationProfile"
import { useAuthStore } from "@/store/auth.store"

export default function OrgProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const { username } = params

  const actorType = useAuthStore((s) => s.actorType)
  const currentOrg = useAuthStore((s) => s.currentOrganization)

  const isOwn =
    actorType === "organization" &&
    currentOrg?.username === username

  return <OrgProfile username={username} isOwn={isOwn} />
}