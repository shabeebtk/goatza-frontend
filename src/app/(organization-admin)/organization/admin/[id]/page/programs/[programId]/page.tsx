import type { Metadata } from "next"
import ProgramEditorPage from "@/features/orgPage/components/ProgramEditorPage/ProgramEditorPage"

export const metadata: Metadata = {
  title: "Edit program · Goatza",
}

interface PageProps {
  params: Promise<{ id: string; programId: string }>
}

export default async function OrganizationPageProgramRoute({ params }: PageProps) {
  const { id, programId } = await params
  return <ProgramEditorPage orgId={id} programId={programId} />
}
