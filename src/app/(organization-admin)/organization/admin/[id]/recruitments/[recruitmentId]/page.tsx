"use client"

/**
 * /organization/admin/[id]/recruitments/[recruitmentId]/page.tsx
 * Org-admin view of a recruitment — shows stats, edit, status change
 */

import { use } from "react"
import { useAuthStore } from "@/store/auth.store"
import RecruitmentDetail from "@/features/recruitments/components/RecruitmentDetail/RecruitmentDetail"

interface OrgRecruitmentDetailPageProps {
  params: Promise<{ id: string; recruitmentId: string }>
}

export default function OrgRecruitmentDetailPage({ params }: OrgRecruitmentDetailPageProps) {
  const { id, recruitmentId } = use(params)

  const currentOrganization = useAuthStore((s) => s.currentOrganization)
  const organizations       = useAuthStore((s) => s.organizations)

  const organization =
    currentOrganization?.id === id
      ? currentOrganization
      : organizations.find((org) => org.id === id)

  if (!organization) return null

  const handleEdit = () => {
    // TODO(api): open the edit modal / navigate to the edit page once the
    // recruitment-edit endpoint is wired. The button stays disabled until then.
  }

  const handleStatusChange = () => {
    // TODO(api): open the status-change sheet once the status endpoint is wired.
    // The button stays disabled until then.
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentDetail
        recruitmentId={recruitmentId}
        isOrgView
        onEdit={handleEdit}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}