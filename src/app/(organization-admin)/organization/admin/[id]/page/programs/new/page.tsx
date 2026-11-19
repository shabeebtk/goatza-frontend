import type { Metadata } from "next"
import ProgramEditorPage from "@/features/orgPage/components/ProgramEditorPage/ProgramEditorPage"

export const metadata: Metadata = {
  title: "New program · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationPageNewProgramRoute({ params }: PageProps) {
  const { id } = await params
  return <ProgramEditorPage orgId={id} />
}
