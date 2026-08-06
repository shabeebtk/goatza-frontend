import type { Metadata } from "next"
import OrgSavedPostsPage from "@/features/settings/OrgSavedPostsPage"

export const metadata: Metadata = {
  title: "Saved · Goatza",
}

interface PageProps {
  params: Promise<{ id: string }>
}

// Inside the org-admin shell the actor headers are already the org, so
// /posts/saved/list returns the ORG's saves with no extra wiring.
export default async function OrgSavedPostsRoute({ params }: PageProps) {
  const { id } = await params
  return <OrgSavedPostsPage orgId={id} />
}
