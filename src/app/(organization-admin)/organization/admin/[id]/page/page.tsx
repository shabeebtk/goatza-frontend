import type { Metadata } from "next"
import PageHub from "@/features/orgPage/components/PageHub/PageHub"

export const metadata: Metadata = {
  title: "Your page · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationPageHubRoute({ params }: PageProps) {
  const { id } = await params
  return <PageHub orgId={id} />
}
