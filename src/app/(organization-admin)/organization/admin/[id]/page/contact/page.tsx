import type { Metadata } from "next"
import ContactSettingsPage from "@/features/orgPage/components/ContactSettingsPage/ContactSettingsPage"

export const metadata: Metadata = {
  title: "How people reach you · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function OrganizationPageContactRoute({ params }: PageProps) {
  const { id } = await params
  return <ContactSettingsPage orgId={id} />
}
