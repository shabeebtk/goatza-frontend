import type { Metadata } from "next"
import SquadsListPage from "@/features/squads/components/SquadsListPage/SquadsListPage"

export const metadata: Metadata = {
  title: "Squads · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationSquadsRoute({ params }: PageProps) {
  const { id } = await params
  return <SquadsListPage orgId={id} />
}
