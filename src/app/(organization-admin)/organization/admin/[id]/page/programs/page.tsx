import type { Metadata } from "next"
import ProgramsPage from "@/features/orgPage/components/ProgramsPage/ProgramsPage"

export const metadata: Metadata = {
  title: "Programs & fees · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationPageProgramsRoute({ params }: PageProps) {
  const { id } = await params
  return <ProgramsPage orgId={id} />
}
