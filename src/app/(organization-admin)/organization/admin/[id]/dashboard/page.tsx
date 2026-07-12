"use client"

import { use } from "react"
import DashboardView from "@/features/dashboard/components/DashboardView/DashboardView"
import { useAuthStore } from "@/store/auth.store"

export default function OrganizationDashboardPage({
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
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "var(--space-4)" }}>
      <DashboardView organization={organization} />
    </div>
  )
}
