import { Suspense } from "react"
import OrgsListPage from "@/features/explore/components/OrgsListPage/OrgsListPage"

// Clubs + teams only, matching the "Teams & Clubs" rail. The backend also has a
// `school` org type; it's deliberately left out here to mirror the rails.
// OrgsListPage reads useSearchParams → needs a Suspense boundary.
export default function ExploreOrganizationsPage() {
  return (
    <Suspense fallback={null}>
      <OrgsListPage types="club,team" title="Teams & Clubs" />
    </Suspense>
  )
}
