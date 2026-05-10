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


  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentDetail
        recruitmentId={recruitmentId}
      />
    </div>
  )
}