import { Suspense } from "react"
import OrgsListPage from "@/features/explore/components/OrgsListPage/OrgsListPage"

// Clubs + teams, matching the "Teams & Clubs" rail. School and college teams
// are "team" pages, so they are here too.
// OrgsListPage reads useSearchParams → needs a Suspense boundary.
export default function ExploreOrganizationsPage() {
  return (
    <Suspense fallback={null}>
      <OrgsListPage types="club,team" title="Teams & Clubs" />
    </Suspense>
  )
}
