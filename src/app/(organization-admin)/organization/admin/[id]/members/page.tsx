import type { Metadata } from "next"
import OrgMembersPage from "@/features/orgMembers/components/OrgMembersPage/OrgMembersPage"

export const metadata: Metadata = {
  title: "Members · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationMembersRoute({ params }: PageProps) {
  const { id } = await params
  return <OrgMembersPage orgId={id} />
}
