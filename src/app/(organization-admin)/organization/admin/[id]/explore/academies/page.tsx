import { Suspense } from "react"
import OrgsListPage from "@/features/explore/components/OrgsListPage/OrgsListPage"

// Academies only, matching the "Academies" rail.
// OrgsListPage reads useSearchParams → needs a Suspense boundary.
export default function OrganizationExploreAcademiesPage() {
  return (
    <Suspense fallback={null}>
      <OrgsListPage types="academy" title="Academies" />
    </Suspense>
  )
}
