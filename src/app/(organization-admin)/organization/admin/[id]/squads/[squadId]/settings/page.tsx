import type { Metadata } from "next"
import SquadPage from "@/features/squads/components/SquadPage/SquadPage"

export const metadata: Metadata = {
  title: "Squads · Goatza",
}

interface PageProps {
  params: Promise<{ id: string; squadId: string }>
}

export default async function OrganizationSquadSettingsRoute({ params }: PageProps) {
  const { id, squadId } = await params
  return <SquadPage orgId={id} squadId={squadId} tab="settings" />
}
