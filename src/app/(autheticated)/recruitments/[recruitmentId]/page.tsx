"use client"

/**
 * /recruitments/[recruitmentId]/page.tsx
 * User-facing view of a recruitment — apply CTA / application status (no isOrgView)
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
    // 1180px, not 720: the detail page is now a two-column poster layout at
    // >=960px (430px poster + content), and a 720px cap would never let the
    // grid engage. Narrow screens are unaffected — the page is fluid below it.
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentDetail
        recruitmentId={recruitmentId}
      />
    </div>
  )
}