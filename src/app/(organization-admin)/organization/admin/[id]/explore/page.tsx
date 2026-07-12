import OrgExplorePage from "@/features/explore/components/OrgExplorePage/OrgExplorePage"

// Org-specific explore: players (nearby + popular) and trending posts, without
// the Teams & Clubs / Academies org rails. The active actor is the organization
// (resolved from the /organization/admin/[id] path), so rails load org-scoped
// data automatically.
export default function OrganizationExplorePage() {
  return <OrgExplorePage />
}
