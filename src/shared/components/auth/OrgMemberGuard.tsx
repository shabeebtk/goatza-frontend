"use client"

import { notFound } from "next/navigation"
import { useOrganizations } from "@/features/organization/hooks/useOrganizations"

interface OrgMemberGuardProps {
  orgId: string
  children: React.ReactNode
}

export default function OrgMemberGuard({ orgId, children }: OrgMemberGuardProps) {
  const { data: organizations, isLoading, isError } = useOrganizations()

  if (isLoading) return null
  
  // If API fails or we have data but the user is not in the org, 
  // show 404 page.
  if (isError) {
    notFound()
  }

  const isMember = organizations?.some((org) => org.id === orgId)
  
  if (!isMember) {
    notFound()
  }

  return <>{children}</>
}
