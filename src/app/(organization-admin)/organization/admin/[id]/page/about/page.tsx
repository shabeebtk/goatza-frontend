import type { Metadata } from "next"
import AboutFactsPage from "@/features/orgPage/components/AboutFactsPage/AboutFactsPage"

export const metadata: Metadata = {
  title: "About & key facts · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationPageAboutRoute({ params }: PageProps) {
  const { id } = await params
  return <AboutFactsPage orgId={id} />
}
