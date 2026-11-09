"use client"

import { notFound } from "next/navigation"
import { useOrganizations } from "@/features/organization/hooks/useOrganizations"

interface OrgMemberGuardProps {
  orgId: string
  children: React.ReactNode
}

/**
 * The org admin area is for the org's members. The answer is the org list:
 * not on it → 404.
 *
 * Only a list we do not HAVE is a 404 for want of data. A background refetch
 * that failed (a weak network right after creating a page, which seeds the
 * list and opens the dashboard) leaves `isError` set with the cached list
 * still there, and that list decides.
 */
export default function OrgMemberGuard({ orgId, children }: OrgMemberGuardProps) {
  const { data: organizations, isLoading } = useOrganizations()

  if (isLoading) return null

  if (!organizations) {
    notFound()
  }

  const isMember = organizations.some((org) => org.id === orgId)

  if (!isMember) {
    notFound()
  }

  return <>{children}</>
}
