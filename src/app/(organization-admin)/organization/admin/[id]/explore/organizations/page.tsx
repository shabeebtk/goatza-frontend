import { Suspense } from "react"
import OrgsListPage from "@/features/explore/components/OrgsListPage/OrgsListPage"

// Clubs + teams only, matching the "Teams & Clubs" rail.
// OrgsListPage reads useSearchParams → needs a Suspense boundary.
export default function OrganizationExploreOrganizationsPage() {
  return (
    <Suspense fallback={null}>
      <OrgsListPage types="club,team" title="Teams & Clubs" />
    </Suspense>
  )
}
