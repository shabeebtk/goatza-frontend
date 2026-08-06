import type { Metadata } from "next"
import OrgSettingsPage from "@/features/settings/OrgSettingsPage"

export const metadata: Metadata = {
  title: "Settings · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationSettingsRoute({ params }: PageProps) {
  const { id } = await params
  return <OrgSettingsPage orgId={id} />
}
