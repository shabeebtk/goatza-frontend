"use client"

import { use } from "react"
import RecruitmentsList from "@/features/recruitments/components/RecruitmentsList/RecruitmentsList"
import { useAuthStore } from "@/store/auth.store"

export default function OrgRecruitmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)
  const organizations = useAuthStore((s) => s.organizations)

  const organization =
    currentOrganization?.id === id
      ? currentOrganization
      : organizations.find((org) => org.id === id)

  if (!organization?.username) return null

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentsList
        username={organization.username}
        isOwn
        showOrg={false}
      />
    </div>
  )
}