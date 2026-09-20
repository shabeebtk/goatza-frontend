"use client"

/**
 * /organization/admin/[id]/recruitments/[recruitmentId]/page.tsx
 * Org-admin view of a recruitment — Details + Applicants tabs.
 * Thin route file: guards the org actor, then renders the feature view.
 */

import { use, Suspense } from "react"
import { useAuthStore } from "@/store/auth.store"
import RecruitmentAdminView from "@/features/recruitments/components/RecruitmentAdminView/RecruitmentAdminView"

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

  return (
    // 1180px, not 720, for the same reason the user-facing route uses it:
    // RecruitmentDetail is a two-column poster layout at >=960px (430px poster
    // + content), and that media query asks the VIEWPORT, not this box. Capped
    // at 720 the grid still engaged on a desktop and then had 244px left for
    // the right-hand column, which crushed the details list to one character
    // per line. Narrow screens are unaffected — the page is fluid below it.
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "var(--space-4)" }}>
      {/* RecruitmentAdminView reads ?tab from the URL, so it needs a Suspense
          boundary (useSearchParams). */}
      <Suspense fallback={null}>
        <RecruitmentAdminView recruitmentId={recruitmentId} />
      </Suspense>
    </div>
  )
}
