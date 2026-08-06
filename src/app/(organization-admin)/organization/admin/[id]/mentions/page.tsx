import type { Metadata } from "next"
import OrgMentionsPage from "@/features/settings/OrgMentionsPage"

export const metadata: Metadata = {
  title: "Mentions · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// Inside the org-admin shell the actor headers are already the org, so
// /posts/mentions/my returns the ORG's mentions with no extra wiring.
export default async function OrgMentionsRoute({ params }: PageProps) {
  const { id } = await params
  return <OrgMentionsPage orgId={id} />
}
