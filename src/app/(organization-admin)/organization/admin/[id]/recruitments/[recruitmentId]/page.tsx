"use client"

/**
 * /organization/admin/[id]/recruitments/[recruitmentId]/page.tsx
 * Org-admin view of a recruitment — shows stats + lets the owner edit it.
 */

import { use, useState } from "react"
import { useAuthStore } from "@/store/auth.store"
import RecruitmentDetail from "@/features/recruitments/components/RecruitmentDetail/RecruitmentDetail"
import CreateRecruitmentTrigger from "@/features/recruitments/components/CreateRecruitmentModal/CreateRecruitmentTrigger"
import { useRecruitmentDetail } from "@/features/recruitments/hooks/useRecruitments"

interface OrgRecruitmentDetailPageProps {
  params: Promise<{ id: string; recruitmentId: string }>
}

export default function OrgRecruitmentDetailPage({ params }: OrgRecruitmentDetailPageProps) {
  const { id, recruitmentId } = use(params)

  const currentOrganization = useAuthStore((s) => s.currentOrganization)
  const organizations       = useAuthStore((s) => s.organizations)

  // Shares the React Query cache with RecruitmentDetail below (same key),
  // so this does not trigger a second network request.
  const { data: recruitment } = useRecruitmentDetail(recruitmentId)
  const [editOpen, setEditOpen] = useState(false)

  const organization =
    currentOrganization?.id === id
      ? currentOrganization
      : organizations.find((org) => org.id === id)

  if (!organization) return null

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentDetail
        recruitmentId={recruitmentId}
        isOrgView
        onEdit={() => setEditOpen(true)}
      />

      {/* Edit flow — reuses the create wizard prefilled, with the org-actor
          guard from CreateRecruitmentTrigger. Only mounted once the owner
          detail is loaded so the wizard prefills correctly. */}
      {recruitment && (
        <CreateRecruitmentTrigger
          mode="edit"
          initialRecruitment={recruitment}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}
